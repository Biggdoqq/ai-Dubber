import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { Subtitle } from "../api/types";
import { fmtClock } from "../lib/format";

interface Props {
  rows: Subtitle[];
  selected: Set<number>;
  sourceLang: string;
  targetLang: string;
  engine: string;
  onSourceChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onEngineChange: (v: string) => void;
  onTranslate: () => void;
  onSpellCheck: () => void;
  onAutoGender: () => void;
  onAutoVoice: () => void;
  onSmartCleanup: () => void;
  busy: boolean;
  onClose: () => void;
  notify: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
}

const LANGS: [string, string][] = [
  ["auto", "Auto-Detect"], ["km", "Khmer"], ["en", "English"], ["th", "Thai"],
  ["vi", "Vietnamese"], ["zh-CN", "Chinese (Simplified)"], ["zh-TW", "Chinese (Traditional)"],
  ["ja", "Japanese"], ["ko", "Korean"], ["fr", "French"], ["es", "Spanish"],
  ["de", "German"], ["ru", "Russian"],
];
const ENGINES: [string, string][] = [
  ["google", "Google Translate (free)"], ["groq", "Groq LLM"],
  ["gemini", "Gemini"], ["nllb", "NLLB-200 (offline)"],
];

type FeatureId =
  | "spell" | "gender" | "voice" | "cleanup"
  | "chars" | "translate" | "suggest" | "ocr";

interface Feature {
  id: FeatureId;
  icon: string;
  title: string;
  desc: string;
  available: boolean;
}

const FEATURES: Feature[] = [
  { id: "spell", icon: "✔", title: "AI Spell Check", desc: "Correct spelling and typos across all subtitle lines using the configured LLM.", available: true },
  { id: "gender", icon: "⚧", title: "Auto Gender", desc: "Detect speaker gender per line from the video's audio (pitch analysis).", available: true },
  { id: "voice", icon: "🎙", title: "Auto Voice Assignment", desc: "Assign TTS voices automatically based on each line's detected gender.", available: true },
  { id: "cleanup", icon: "🧹", title: "Subtitle Cleanup", desc: "Trim whitespace, drop empty lines, and normalize punctuation across rows.", available: true },
  { id: "chars", icon: "👥", title: "Character Detection", desc: "Detect distinct speakers from 'NAME:' style prefixes in the subtitle text.", available: true },
  { id: "translate", icon: "🌐", title: "Smart Translation", desc: "Translate every line with duration-aware phrasing, gender, and emotion.", available: true },
  { id: "suggest", icon: "💡", title: "AI Suggestions", desc: "Scan subtitles for issues: empty lines, fast reading speed, overlaps, missing voices.", available: true },
  { id: "ocr", icon: "📷", title: "OCR Subtitles", desc: "Optical Character Recognition (OCR) is not bundled. Use Video Effects for region blurring.", available: false },
];

interface Suggestion {
  index: number;
  kind: "empty" | "fast" | "overlap" | "long" | "novoice";
  message: string;
}

const MAX_CPS = 25;

export default function AIStudioDialog({
  rows,
  selected,
  sourceLang,
  targetLang,
  engine,
  onSourceChange,
  onTargetChange,
  onEngineChange,
  onTranslate,
  onSpellCheck,
  onAutoGender,
  onAutoVoice,
  onSmartCleanup,
  busy,
  onClose,
  notify,
}: Props) {
  const [active, setActive] = useState<FeatureId>("spell");
  const [charResult, setCharResult] = useState<{ characters: string[]; counts: Record<string, number> } | null>(null);
  const [charLoading, setCharLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const feature = FEATURES.find((f) => f.id === active)!;

  const runCharDetection = async () => {
    if (rows.length === 0) return notify("No subtitles to analyze", "warning");
    setCharLoading(true);
    setCharResult(null);
    try {
      const r = await api.detectCharacters(rows);
      setCharResult({ characters: r.characters, counts: r.counts });
      notify(
        r.characters.length
          ? `Detected ${r.characters.length} character(s)`
          : "No 'NAME:' style speaker labels found",
        r.characters.length ? "success" : "info"
      );
    } catch (e) {
      notify(`Character detection failed: ${String(e).split("\n")[0]}`, "error");
    } finally {
      setCharLoading(false);
    }
  };

  const runSuggestions = () => {
    if (rows.length === 0) return notify("No subtitles to analyze", "warning");
    const out: Suggestion[] = [];
    rows.forEach((r, i) => {
      const text = r.text.trim();
      const dur = r.end - r.start;
      if (!text) out.push({ index: i, kind: "empty", message: "Empty line — no text to dub" });
      else {
        if (dur > 0 && text.length / dur > MAX_CPS)
          out.push({ index: i, kind: "fast", message: `Reading speed high (${Math.round(text.length / dur)} cps)` });
        if (!r.voice)
          out.push({ index: i, kind: "novoice", message: "No voice assigned (uses default)" });
        if (text.length > 120)
          out.push({ index: i, kind: "long", message: `Very long line (${text.length} chars)` });
      }
      if (i > 0 && r.start < rows[i - 1].end - 0.001)
        out.push({ index: i, kind: "overlap", message: "Overlaps the previous line" });
    });
    setSuggestions(out);
    notify(out.length ? `Found ${out.length} suggestion(s)` : "No issues found — subtitles look good", out.length ? "info" : "success");
  };

  const ActionButton = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button className="btn-primary" onClick={onClick} disabled={busy || disabled}>
      {label}
    </button>
  );

  const suggestionSummary = useMemo(() => {
    if (!suggestions) return null;
    const by: Record<string, number> = {};
    suggestions.forEach((s) => (by[s.kind] = (by[s.kind] || 0) + 1));
    return by;
  }, [suggestions]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="panel w-[880px] max-w-full max-h-[90vh] flex flex-col shadow-panel">
        {/* header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/10 to-transparent">
          <div>
            <h2 className="text-base font-semibold text-txt">✨ AI Studio</h2>
            <p className="text-xs text-txt-faint">
              AI-powered subtitle tools · {rows.length} row{rows.length === 1 ? "" : "s"} loaded
            </p>
          </div>
          <button className="text-txt-muted hover:text-txt text-lg" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* feature rail */}
          <nav className="w-56 shrink-0 border-r border-border overflow-auto p-2 space-y-1">
            {FEATURES.map((f) => (
              <button
                key={f.id}
                onClick={() => setActive(f.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-left transition-colors ${
                  active === f.id
                    ? "bg-accent/15 text-accent"
                    : "text-txt-muted hover:text-txt hover:bg-bg-hover"
                } ${!f.available ? "opacity-50" : ""}`}
              >
                <span className="text-base shrink-0">{f.icon}</span>
                <span className="truncate">{f.title}</span>
                {!f.available && <span className="ml-auto text-[9px] text-txt-faint">soon</span>}
              </button>
            ))}
          </nav>

          {/* content */}
          <div className="flex-1 overflow-auto p-5 min-h-0">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-2xl">{feature.icon}</span>
              <div>
                <h3 className="text-base font-semibold text-txt">{feature.title}</h3>
                <p className="text-xs text-txt-muted mt-0.5 max-w-lg">{feature.desc}</p>
              </div>
            </div>

            {active === "spell" && (
              <div className="space-y-3">
                <p className="text-xs text-txt-faint">Applies to all {rows.length} rows. Requires a Groq or Gemini API key in Settings.</p>
                <ActionButton label="Run Spell Check" onClick={onSpellCheck} disabled={rows.length === 0} />
              </div>
            )}

            {active === "gender" && (
              <div className="space-y-3">
                <p className="text-xs text-txt-faint">Analyzes the loaded video's audio at each line's timing to guess Male/Female.</p>
                <ActionButton label="Detect Gender" onClick={onAutoGender} disabled={rows.length === 0} />
              </div>
            )}

            {active === "voice" && (
              <div className="space-y-3">
                <p className="text-xs text-txt-faint">Maps detected gender to default Khmer voices (Piseth / Sreymom). Run Auto Gender first for best results.</p>
                <ActionButton label="Assign Voices" onClick={onAutoVoice} disabled={rows.length === 0} />
              </div>
            )}

            {active === "cleanup" && (
              <div className="space-y-3">
                <p className="text-xs text-txt-faint">Removes empty rows and normalizes text. This changes your row count.</p>
                <ActionButton label="Clean Up Subtitles" onClick={onSmartCleanup} disabled={rows.length === 0} />
              </div>
            )}

            {active === "chars" && (
              <div className="space-y-3">
                <ActionButton
                  label={charLoading ? "Detecting…" : "Detect Characters"}
                  onClick={runCharDetection}
                  disabled={rows.length === 0 || charLoading}
                />
                {charResult && (
                  <div className="panel p-3">
                    {charResult.characters.length === 0 ? (
                      <p className="text-xs text-txt-faint">
                        No speaker labels found. Character detection looks for lines that start with
                        <span className="font-mono"> NAME:</span> or <span className="font-mono">NAME —</span>.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {charResult.characters.map((c) => (
                          <li key={c} className="flex items-center justify-between text-sm">
                            <span className="text-txt">👤 {c}</span>
                            <span className="text-xs text-txt-faint tabular-nums">{charResult.counts[c]} line(s)</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {active === "ocr" && (
              <div className="space-y-3">
                <p className="text-xs text-warning font-semibold">Optical Character Recognition (OCR) is not bundled in this version.</p>
                <p className="text-xs text-txt-muted max-w-lg">
                  Heuristic text detection and subtitle region masking is available via OpenCV. Go to <strong>Effects Studio &rarr; Video Effects &rarr; Auto Blur Text/Titles</strong> to mask subtitle blocks without external cloud APIs.
                </p>
                <button className="btn-primary opacity-60 cursor-not-allowed" disabled>
                  OCR Unavailable
                </button>
              </div>
            )}

            {active === "translate" && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="label">From</span>
                    <select className="input py-1" value={sourceLang} onChange={(e) => onSourceChange(e.target.value)}>
                      {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <span className="text-txt-faint">→</span>
                  <div className="flex items-center gap-1">
                    <span className="label">To</span>
                    <select className="input py-1" value={targetLang} onChange={(e) => onTargetChange(e.target.value)}>
                      {LANGS.filter(([v]) => v !== "auto").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="label">Engine</span>
                    <select className="input py-1" value={engine} onChange={(e) => onEngineChange(e.target.value)}>
                      {ENGINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-txt-faint">Translates all {rows.length} rows, preserving timing. LLM engines also fill gender/emotion.</p>
                <ActionButton label="Translate All" onClick={onTranslate} disabled={rows.length === 0} />
              </div>
            )}

            {active === "suggest" && (
              <div className="space-y-3">
                <ActionButton label="Analyze Subtitles" onClick={runSuggestions} disabled={rows.length === 0} />
                {suggestions && (
                  <div className="space-y-2">
                    {suggestionSummary && Object.keys(suggestionSummary).length > 0 && (
                      <div className="flex gap-2 flex-wrap text-xs">
                        {Object.entries(suggestionSummary).map(([k, n]) => (
                          <span key={k} className="px-2 py-0.5 rounded bg-bg-elevated text-txt-muted">
                            {k}: {n}
                          </span>
                        ))}
                      </div>
                    )}
                    {suggestions.length === 0 ? (
                      <p className="text-sm text-success">✓ No issues found — subtitles look good.</p>
                    ) : (
                      <div className="panel p-2 max-h-[320px] overflow-auto space-y-1">
                        {suggestions.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs border-b border-border-muted last:border-0 py-1">
                            <span className="text-txt-faint tabular-nums w-8 shrink-0">#{s.index + 1}</span>
                            <span className="font-mono text-txt-faint w-16 shrink-0">{fmtClock(rows[s.index].start)}</span>
                            <span className={`shrink-0 ${
                              s.kind === "empty" || s.kind === "overlap" ? "text-danger" : "text-warning"
                            }`}>
                              {s.kind}
                            </span>
                            <span className="text-txt-muted truncate">{s.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-txt-faint">
            {selected.size > 0 ? `${selected.size} row(s) selected` : "Operates on all rows"}
          </span>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </div>
    </div>
  );
}
