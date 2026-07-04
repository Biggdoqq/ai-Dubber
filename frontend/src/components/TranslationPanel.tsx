import { useEffect, useMemo, useRef, useState } from "react";
import type { Subtitle } from "../api/types";

interface Props {
  sourceLang: string;
  targetLang: string;
  engine: string;
  onSourceChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onEngineChange: (v: string) => void;
  onTranslate: () => void;
  onSpellCheck: () => void;
  onAutoGender: () => void;
  busy: boolean;
  translateJob?: {
    job: any;
    running: boolean;
    cancel: () => void;
  };
  rows?: Subtitle[];
}

interface HistoryItem {
  id: string;
  timestamp: string;
  source: string;
  target: string;
  engine: string;
  count: number;
}

const LANGS: { code: string; name: string; flag: string }[] = [
  { code: "auto", name: "Auto-Detect", flag: "🔍" },
  { code: "km", name: "Khmer", flag: "🇰🇭" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "th", name: "Thai", flag: "🇹🇭" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳" },
  { code: "zh-CN", name: "Chinese (Simplified)", flag: "🇨🇳" },
  { code: "zh-TW", name: "Chinese (Traditional)", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
];

const ENGINES = [
  { code: "google", name: "Google Translate (free)", desc: "Fast & reliable translation engine" },
  { code: "groq", name: "Groq LLM", desc: "Advanced AI translation via Groq cloud" },
  { code: "gemini", name: "Gemini", desc: "Google Gemini generative translation" },
  { code: "nllb", name: "NLLB-200 (offline)", desc: "Offline meta machine translation" },
];

export default function TranslationPanel({
  sourceLang,
  targetLang,
  engine,
  onSourceChange,
  onTargetChange,
  onEngineChange,
  onTranslate,
  onSpellCheck,
  onAutoGender,
  busy,
  translateJob,
  rows = [],
}: Props) {
  const [showSrcPicker, setShowSrcPicker] = useState(false);
  const [showDstPicker, setShowDstPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [srcQuery, setSrcQuery] = useState("");
  const [dstQuery, setDstQuery] = useState("");
  
  const [favEngines, setFavEngines] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // ETA state
  const startTimeRef = useRef<number | null>(null);
  const [eta, setEta] = useState<string | null>(null);

  // Load favorites & history on mount
  useEffect(() => {
    try {
      const storedFavs = localStorage.getItem("fav_engines");
      if (storedFavs) setFavEngines(new Set(JSON.parse(storedFavs)));

      const storedHist = localStorage.getItem("translate_history");
      if (storedHist) setHistory(JSON.parse(storedHist));
    } catch {
      // ignore
    }
  }, []);

  // Save history item when job finishes successfully
  const jobDone = translateJob?.job?.status === "done";
  const jobRunning = translateJob?.running ?? false;
  const pct = translateJob?.job?.progress ?? 0;

  useEffect(() => {
    if (jobRunning && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
      setEta(null);
    }
    if (!jobRunning) {
      startTimeRef.current = null;
      setEta(null);
    }
    if (pct > 2 && startTimeRef.current !== null) {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const totalEst = elapsed / (pct / 100);
      const rem = Math.max(0, Math.round(totalEst - elapsed));
      setEta(rem > 0 ? `${rem}s remaining` : "wrapping up…");
    }
  }, [jobRunning, pct]);

  // Log to history on successful translation completion
  useEffect(() => {
    if (jobDone) {
      const record: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: sourceLang,
        target: targetLang,
        engine,
        count: rows.length,
      };
      setHistory((prev) => {
        const next = [record, ...prev].slice(0, 10);
        try {
          localStorage.setItem("translate_history", JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  }, [jobDone]);

  // Toggle favorite engines
  const toggleFavEngine = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    setFavEngines((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      try {
        localStorage.setItem("fav_engines", JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Sort engines so favorited ones appear at the top
  const sortedEngines = useMemo(() => {
    return [...ENGINES].sort((a, b) => {
      const aFav = favEngines.has(a.code) ? 1 : 0;
      const bFav = favEngines.has(b.code) ? 1 : 0;
      return bFav - aFav;
    });
  }, [favEngines]);

  // Filters for languages
  const filteredSrc = useMemo(() => {
    const q = srcQuery.trim().toLowerCase();
    if (!q) return LANGS;
    return LANGS.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q));
  }, [srcQuery]);

  const filteredDst = useMemo(() => {
    const q = dstQuery.trim().toLowerCase();
    const list = LANGS.filter((l) => l.code !== "auto");
    if (!q) return list;
    return list.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q));
  }, [dstQuery]);

  const currentSrc = LANGS.find((l) => l.code === sourceLang) || LANGS[0];
  const currentDst = LANGS.find((l) => l.code === targetLang) || LANGS[1];
  const currentEngine = ENGINES.find((e) => e.code === engine) || ENGINES[0];

  return (
    <div className="panel px-5 py-4 flex flex-col gap-3.5 text-xs">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/5 pb-2.5">
        <span className="font-bold text-txt flex items-center gap-2">
          <span className="text-accent drop-shadow-[0_0_6px_rgba(99,102,241,0.5)]">🌐</span> Translate & AI Language Tools
        </span>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <button
              className="btn-ghost py-1 px-2.5 text-[10px] rounded-lg border border-white/5"
              onClick={() => setShowHistory(!showHistory)}
            >
              📜 History ({history.length})
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Grid for Language Selectors */}
      <div className="grid grid-cols-2 gap-3 relative z-20">
        {/* Source Language */}
        <div className="flex flex-col gap-1 relative">
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">From</label>
          <button
            onClick={() => {
              setShowSrcPicker(!showSrcPicker);
              setShowDstPicker(false);
              setSrcQuery("");
            }}
            className="btn-ghost w-full px-3 py-2 rounded-xl font-bold text-txt flex items-center justify-between text-left"
          >
            <span className="truncate">{currentSrc.flag} {currentSrc.name}</span>
            <span className="text-txt-faint">▾</span>
          </button>
          {showSrcPicker && (
            <div className="absolute top-full left-0 mt-1.5 w-full bg-[#0d0f17]/95 backdrop-blur-2xl border border-white/5 rounded-2xl shadow-2xl z-50 p-2 animate-scale-in">
              <input
                autoFocus
                className="input w-full py-1.5 px-2.5 text-[10px] mb-2"
                placeholder="Search source language…"
                value={srcQuery}
                onChange={(e) => setSrcQuery(e.target.value)}
              />
              <div className="max-h-40 overflow-y-auto divide-y divide-white/5">
                {filteredSrc.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      onSourceChange(l.code);
                      setShowSrcPicker(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-accent/15 hover:text-white transition-colors rounded-xl ${
                      l.code === sourceLang ? "bg-accent/10 text-accent font-bold" : "text-txt"
                    }`}
                  >
                    {l.flag} {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Target Language */}
        <div className="flex flex-col gap-1 relative">
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">To</label>
          <button
            onClick={() => {
              setShowDstPicker(!showDstPicker);
              setShowSrcPicker(false);
              setDstQuery("");
            }}
            className="btn-ghost w-full px-3 py-2 rounded-xl font-bold text-txt flex items-center justify-between text-left"
          >
            <span className="truncate">{currentDst.flag} {currentDst.name}</span>
            <span className="text-txt-faint">▾</span>
          </button>
          {showDstPicker && (
            <div className="absolute top-full left-0 mt-1.5 w-full bg-[#0d0f17]/95 backdrop-blur-2xl border border-white/5 rounded-2xl shadow-2xl z-50 p-2 animate-scale-in">
              <input
                autoFocus
                className="input w-full py-1.5 px-2.5 text-[10px] mb-2"
                placeholder="Search target language…"
                value={dstQuery}
                onChange={(e) => setDstQuery(e.target.value)}
              />
              <div className="max-h-40 overflow-y-auto divide-y divide-white/5">
                {filteredDst.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      onTargetChange(l.code);
                      setShowDstPicker(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-accent/15 hover:text-white transition-colors rounded-xl ${
                      l.code === targetLang ? "bg-accent/10 text-accent font-bold" : "text-txt"
                    }`}
                  >
                    {l.flag} {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Engine Selection Block */}
      <div className="flex flex-col gap-1 relative z-10">
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Translation Engine</label>
        <div className="flex items-center gap-2">
          <select
            className="input flex-1 py-2 text-xs rounded-xl font-bold bg-[#0c0d16]/75"
            value={engine}
            onChange={(e) => onEngineChange(e.target.value)}
          >
            {sortedEngines.map((eg) => {
              const isFav = favEngines.has(eg.code);
              return (
                <option key={eg.code} value={eg.code} className="bg-bg-panel text-txt">
                  {isFav ? "⭐ " : ""} {eg.name}
                </option>
              );
            })}
          </select>
          <button
            className={`p-2 hover:text-yellow-400 transition-colors bg-white/[0.03] border border-white/5 rounded-xl ${
              favEngines.has(engine) ? "text-yellow-400" : "text-txt-faint opacity-50"
            }`}
            onClick={(e) => toggleFavEngine(e, engine)}
            title={favEngines.has(engine) ? "Unfavorite Engine" : "Favorite Engine"}
          >
            ⭐
          </button>
        </div>
      </div>

      {/* Action Buttons Block */}
      <div className="flex items-center gap-2 mt-1.5 border-t border-white/5 pt-3.5">
        {translateJob?.job?.status === "error" && (
          <button
            className="btn-ghost py-2 px-3 rounded-xl text-danger border border-danger/30 hover:bg-danger/10 animate-pulse font-semibold"
            onClick={onTranslate}
            disabled={busy}
          >
            🔄 Retry
          </button>
        )}
        <button
          className="btn-ghost flex-1 py-2 rounded-xl text-txt text-center"
          onClick={onAutoGender}
          disabled={busy}
          title="Auto-detect gender cues from text"
        >
          Auto Gender
        </button>
        <button
          className="btn-ghost flex-1 py-2 rounded-xl text-txt text-center"
          onClick={onSpellCheck}
          disabled={busy}
          title="Run AI grammar and spelling corrections"
        >
          Spell Check
        </button>
        <button
          className="btn-primary flex-1 py-2 font-bold rounded-xl shadow-accent/20 shadow-md text-center"
          onClick={onTranslate}
          disabled={busy}
        >
          Translate
        </button>
      </div>

      {/* running progress / eta tracker bar */}
      {jobRunning && (
        <div className="mt-1.5 p-2 bg-accent/5 border border-accent/20 rounded-md flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold text-txt-muted">
            <span>🚀 Batch translating segments via {currentEngine.name}…</span>
            {eta && <span className="font-mono text-accent">ETA: {eta}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-txt w-8 text-right">{pct}%</span>
            <button
              className="text-[10px] text-danger hover:text-danger-hover px-1.5 py-0.2 rounded border border-danger/25"
              onClick={() => translateJob?.cancel()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* translation history list */}
      {showHistory && history.length > 0 && (
        <div className="mt-1 p-2 bg-bg/30 border border-border/50 rounded-md flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-txt-faint uppercase">Recent translation history</span>
          <div className="flex flex-col gap-1 max-h-24 overflow-y-auto divide-y divide-border/20">
            {history.map((h) => {
              const srcL = LANGS.find((l) => l.code === h.source)?.name || h.source;
              const dstL = LANGS.find((l) => l.code === h.target)?.name || h.target;
              const engN = ENGINES.find((e) => e.code === h.engine)?.name || h.engine;
              return (
                <div
                  key={h.id}
                  onClick={() => {
                    onSourceChange(h.source);
                    onTargetChange(h.target);
                    onEngineChange(h.engine);
                    setShowHistory(false);
                  }}
                  className="py-1 flex items-center justify-between hover:bg-bg-hover/30 rounded px-1.5 cursor-pointer text-[10px]"
                >
                  <span className="text-txt-muted font-medium">
                    {srcL} ➔ {dstL} · {engN} ({h.count} lines)
                  </span>
                  <span className="text-txt-faint font-mono">{h.timestamp}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
