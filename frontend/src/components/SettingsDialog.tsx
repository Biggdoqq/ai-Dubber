import { useCallback, useEffect, useRef, useState } from "react";
import { api, pollJob } from "../api/client";
import type { AppSettings } from "../api/types";
import Spinner from "./Spinner";

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

type TabId =
  | "general"
  | "ai"
  | "models"
  | "gpu"
  | "ffmpeg"
  | "cache"
  | "downloads"
  | "language"
  | "theme"
  | "backup"
  | "restore";

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "general",   icon: "⚙️",  label: "General" },
  { id: "language",  icon: "🌐",  label: "Language" },
  { id: "theme",     icon: "🎨",  label: "Theme" },
  { id: "ai",        icon: "🤖",  label: "AI & Models" },
  { id: "models",    icon: "📦",  label: "Model Library" },
  { id: "gpu",       icon: "⚡",  label: "GPU" },
  { id: "ffmpeg",    icon: "🎬",  label: "FFmpeg" },
  { id: "cache",     icon: "🗂️",  label: "Cache" },
  { id: "downloads", icon: "⬇️",  label: "Downloads" },
  { id: "backup",    icon: "💾",  label: "Backup" },
  { id: "restore",   icon: "♻️",  label: "Restore" },
];

// ─── small helpers ────────────────────────────────────────────────────────────
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">{label}</label>
    {children}
  </div>
);

const Check = ({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-2 text-xs text-txt font-semibold cursor-pointer select-none">
    <input type="checkbox" className="accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const Inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={"input py-1 text-xs bg-bg-elevated/40 rounded " + (props.className ?? "")} />
);

const Sel = ({
  value, onChange, children,
}: { value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
  <select
    className="input py-1 text-xs bg-bg-elevated/40 rounded w-full"
    value={value}
    onChange={(e) => onChange(e.target.value)}
  >
    {children}
  </select>
);

// ─── main component ───────────────────────────────────────────────────────────
export default function SettingsDialog({ onClose, onSaved }: Props) {
  const [tab, setTab] = useState<TabId>("general");
  const [settings, setSettings] = useState<AppSettings>({});
  const [groqKey, setGroqKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [saving, setSaving] = useState(false);

  // GPU live info
  const [gpuInfo, setGpuInfo] = useState<{
    available: boolean; device_name: string | null; cuda_version: string | null;
    torch_version: string | null; encoders: string[]; worker_python: string; error?: string;
  } | null>(null);
  const [gpuLoading, setGpuLoading] = useState(false);

  // FFmpeg health
  const [health, setHealth] = useState<{ ffmpeg: boolean; ffmpeg_path: string; worker_python?: string; models_dir?: string } | null>(null);

  // Cache info
  const [cacheInfo, setCacheInfo] = useState<{
    cache_dir: string; total_mb: number; entries: { name: string; is_dir: boolean; size_mb: number }[];
  } | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);

  // Model library
  const [modelLib, setModelLib] = useState<{
    models_dir: string;
    models: { key: string; label: string; note: string; installed: boolean; size_mb: number; downloadable: boolean }[];
  } | null>(null);
  const [dlProgress, setDlProgress] = useState<Record<string, number>>({});
  const [dlRunning, setDlRunning] = useState<string | null>(null);

  // Restore file input
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restoreMsg, setRestoreMsg] = useState("");

  const set = useCallback((patch: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...patch })), []);

  // Load settings on mount
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
  }, []);

  // Lazy-load live data when tab opens
  useEffect(() => {
    if (tab === "gpu" && !gpuInfo) {
      setGpuLoading(true);
      api.gpuInfo().then(setGpuInfo).catch(() => {}).finally(() => setGpuLoading(false));
    }
    if (tab === "ffmpeg" && !health) {
      api.health().then((h) => setHealth(h as any)).catch(() => {});
    }
    if (tab === "cache" && !cacheInfo) {
      api.cacheInfo().then(setCacheInfo).catch(() => {});
    }
    if ((tab === "models" || tab === "downloads") && !modelLib) {
      api.listModels().then(setModelLib).catch(() => {});
    }
  }, [tab]);

  const save = async () => {
    setSaving(true);
    const values: Record<string, unknown> = {
      language: settings.language,
      theme: settings.theme,
      srt_offset: settings.srt_offset,
      whisper_model_size: settings.whisper_model_size,
      use_gemini_transcribe: settings.use_gemini_transcribe,
      use_groq: settings.use_groq,
      use_gemini: settings.use_gemini,
      use_nllb_translate: settings.use_nllb_translate,
      use_gpu_nllb: settings.use_gpu_nllb,
      gemini_model_name: settings.gemini_model_name,
      groq_model_name: settings.groq_model_name,
      nllb_model_name: settings.nllb_model_name,
      translation_style: settings.translation_style,
      custom_translation_instructions: settings.custom_translation_instructions,
      auto_check_update: settings.auto_check_update,
      update_check_url: settings.update_check_url,
    };
    if (groqKey) values.groq_api_key = groqKey;
    if (geminiKey) values.gemini_api_key = geminiKey;
    await api.updateSettings(values).catch(() => {});
    setSaving(false);
    onSaved?.();
    onClose();
  };

  const downloadModel = async (key: string) => {
    if (dlRunning) return;
    setDlRunning(key);
    setDlProgress((p) => ({ ...p, [key]: 0 }));
    try {
      const { job_id } = await api.downloadModel(key);
      await pollJob(job_id, (j) => setDlProgress((p) => ({ ...p, [key]: j.progress })));
      await api.listModels().then(setModelLib).catch(() => {});
    } catch {
      // ignore
    } finally {
      setDlRunning(null);
    }
  };

  const clearCache = async (target?: string) => {
    setCacheClearing(true);
    try {
      await api.clearCache(target);
      const fresh = await api.cacheInfo();
      setCacheInfo(fresh);
    } catch {
      // ignore
    } finally {
      setCacheClearing(false);
    }
  };

  const backupSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dubber_settings_backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        await api.updateSettings(parsed);
        const fresh = await api.getSettings();
        setSettings(fresh);
        setRestoreMsg("✅ Settings restored successfully.");
      } catch {
        setRestoreMsg("❌ Invalid settings file.");
      }
    };
    reader.readAsText(file);
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="panel w-[820px] max-w-full max-h-[90vh] flex flex-col shadow-2xl border border-border/80 bg-bg-panel/95 rounded-xl">

        {/* header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/15 to-transparent shrink-0">
          <div>
            <h2 className="text-sm font-bold text-txt flex items-center gap-1.5">⚙️ Application Settings</h2>
            <p className="text-[9px] text-txt-faint uppercase font-bold mt-0.5">Preferences, models, GPU, cache, and backup/restore</p>
          </div>
          <button className="text-txt-faint hover:text-txt text-lg transition-colors" onClick={onClose}>✕</button>
        </div>

        {/* body: sidebar + content */}
        <div className="flex flex-1 min-h-0">

          {/* sidebar */}
          <nav className="w-44 shrink-0 border-r border-border/40 p-2 space-y-0.5 bg-bg/15 overflow-y-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-left transition-all ${
                  tab === t.id
                    ? "bg-accent/15 text-accent font-bold border-l-2 border-accent"
                    : "text-txt-muted hover:text-txt hover:bg-bg-hover/20"
                }`}
              >
                <span className="shrink-0">{t.icon}</span>
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* content pane */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            <div className="space-y-4 max-w-lg">

              {/* ── GENERAL ── */}
              {tab === "general" && (
                <>
                  <Row label="SRT Time Offset (seconds)">
                    <Inp type="number" step={0.1} value={(settings.srt_offset as number) ?? 0}
                      onChange={(e) => set({ srt_offset: parseFloat(e.target.value) || 0 })} />
                  </Row>
                  <Row label="Update Settings">
                    <Check label="Check for updates on startup" checked={!!settings.auto_check_update}
                      onChange={(v) => set({ auto_check_update: v })} />
                  </Row>
                  <Row label="Update Check URL">
                    <Inp value={(settings.update_check_url as string) || ""}
                      onChange={(e) => set({ update_check_url: e.target.value })}
                      placeholder="https://…/version.json" className="w-full" />
                  </Row>
                  <Row label="API Keys">
                    <Inp type="password"
                      placeholder={settings.groq_api_key_set ? "Groq key set ••••••••" : "Groq API key (gsk_…)"}
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      className="w-full mb-1.5" />
                    <Inp type="password"
                      placeholder={settings.gemini_api_key_set ? "Gemini key set ••••••••" : "Gemini API key (AIza…)"}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="w-full" />
                    <p className="text-[10px] text-txt-faint">Multiple keys can be comma-separated for rotation.</p>
                  </Row>
                </>
              )}

              {/* ── LANGUAGE ── */}
              {tab === "language" && (
                <Row label="Interface Language">
                  <Sel value={settings.language || "km"} onChange={(v) => set({ language: v })}>
                    <option value="km">🇰🇭 ខ្មែរ (Khmer)</option>
                    <option value="en">🇺🇸 English</option>
                    <option value="th">🇹🇭 ภาษาไทย (Thai)</option>
                    <option value="vi">🇻🇳 Tiếng Việt (Vietnamese)</option>
                    <option value="zh">🇨🇳 中文 (Chinese)</option>
                    <option value="ja">🇯🇵 日本語 (Japanese)</option>
                    <option value="ko">🇰🇷 한국어 (Korean)</option>
                  </Sel>
                </Row>
              )}

              {/* ── THEME ── */}
              {tab === "theme" && (
                <>
                  <Row label="Color Theme">
                    <Sel value={settings.theme || "dark"} onChange={(v) => set({ theme: v })}>
                      <option value="dark">🌙 Dark</option>
                      <option value="light">☀️ Light</option>
                      <option value="system">🖥️ Follow System</option>
                    </Sel>
                  </Row>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { label: "Dark", value: "dark", bg: "bg-[#1a1a2e]", accent: "bg-[#7c6af5]" },
                      { label: "Light", value: "light", bg: "bg-[#f5f5f5]", accent: "bg-[#6c5ce7]" },
                      { label: "System", value: "system", bg: "bg-gradient-to-br from-[#1a1a2e] to-[#f0f0f0]", accent: "bg-[#6c5ce7]" },
                    ].map((t) => (
                      <button
                        key={t.value}
                        onClick={() => set({ theme: t.value })}
                        className={`rounded-lg border-2 overflow-hidden transition-all ${
                          (settings.theme || "dark") === t.value ? "border-accent" : "border-border/40 hover:border-border"
                        }`}
                      >
                        <div className={`${t.bg} h-12 flex items-end p-1.5`}>
                          <div className={`${t.accent} h-2.5 w-2/3 rounded-sm`} />
                        </div>
                        <div className="text-[10px] text-txt py-1 font-semibold">{t.label}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── AI ── */}
              {tab === "ai" && (
                <>
                  <Row label="Transcription Engine">
                    <div className="space-y-1.5">
                      <Check label="Use Gemini for transcription (cloud)" checked={!!settings.use_gemini_transcribe}
                        onChange={(v) => set({ use_gemini_transcribe: v })} />
                    </div>
                  </Row>
                  <Row label="Translation Engines">
                    <div className="space-y-1.5">
                      <Check label="Use Groq LLM (cloud)" checked={!!settings.use_groq} onChange={(v) => set({ use_groq: v })} />
                      <Check label="Use Gemini (cloud)" checked={!!settings.use_gemini} onChange={(v) => set({ use_gemini: v })} />
                      <Check label="Use NLLB-200 (offline)" checked={!!settings.use_nllb_translate}
                        onChange={(v) => set({ use_nllb_translate: v })} />
                      <div className="pl-5">
                        <Check label="GPU acceleration for NLLB-200" checked={!!settings.use_gpu_nllb}
                          onChange={(v) => set({ use_gpu_nllb: v })} />
                      </div>
                    </div>
                  </Row>
                  <Row label="Translation Style">
                    <Sel value={(settings.translation_style as string) || "default"}
                      onChange={(v) => set({ translation_style: v })}>
                      {["default", "formal", "casual", "movie", "youthful"].map((s) => (
                        <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                      ))}
                    </Sel>
                  </Row>
                  <Row label="Groq Model Name">
                    <Inp value={(settings.groq_model_name as string) || ""}
                      onChange={(e) => set({ groq_model_name: e.target.value })}
                      placeholder="llama-3.3-70b-versatile" className="w-full" />
                  </Row>
                  <Row label="Gemini Model Name">
                    <Inp value={(settings.gemini_model_name as string) || ""}
                      onChange={(e) => set({ gemini_model_name: e.target.value })}
                      placeholder="gemini-1.5-flash" className="w-full" />
                  </Row>
                  <Row label="Custom Instructions / Glossary">
                    <textarea
                      className="input w-full h-20 resize-none text-xs py-1.5 px-2.5 bg-bg-elevated/40 rounded"
                      value={(settings.custom_translation_instructions as string) || ""}
                      onChange={(e) => set({ custom_translation_instructions: e.target.value })}
                      placeholder="e.g. keep brand names in English; use informal tone"
                    />
                  </Row>
                </>
              )}

              {/* ── MODELS ── */}
              {tab === "models" && (
                <>
                  <Row label="Whisper Model Size">
                    <Sel value={settings.whisper_model_size || "base"}
                      onChange={(v) => set({ whisper_model_size: v })}>
                      {["tiny", "base", "small", "medium", "large-v2", "large-v3"].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </Sel>
                  </Row>
                  <Row label="NLLB Model">
                    <Inp value={(settings.nllb_model_name as string) || ""}
                      onChange={(e) => set({ nllb_model_name: e.target.value })}
                      placeholder="facebook/nllb-200-distilled-600M" className="w-full" />
                  </Row>
                  {modelLib && (
                    <Row label={`Model Library (${modelLib.models_dir})`}>
                      <div className="space-y-1.5">
                        {modelLib.models.map((m) => (
                          <div key={m.key} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/40 bg-bg/20 text-xs">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-txt truncate">{m.label}</div>
                              <div className="text-txt-faint text-[9px] font-mono">{m.note} · {m.size_mb > 0 ? `${m.size_mb} MB` : "size unknown"}</div>
                              {dlRunning === m.key && (
                                <div className="space-y-1 mt-1.5">
                                  <div className="h-1 bg-bg-elevated rounded overflow-hidden">
                                    <div className="h-full bg-accent transition-all duration-300" style={{ width: `${dlProgress[m.key] ?? 0}%` }} />
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center gap-2 pl-2">
                              {m.installed ? (
                                <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded">Installed</span>
                              ) : m.downloadable ? (
                                <button
                                  className="btn-ghost text-[9px] px-2 py-0.5 border border-accent/40 rounded hover:bg-accent/10 flex items-center gap-1.5"
                                  onClick={() => downloadModel(m.key)}
                                  disabled={dlRunning !== null}
                                >
                                  {dlRunning === m.key ? (
                                    <>
                                      <Spinner size={8} className="text-accent" />
                                      <span>{dlProgress[m.key] ?? 0}%</span>
                                    </>
                                  ) : (
                                    <span>Download</span>
                                  )}
                                </button>
                              ) : (
                                <span className="text-[9px] text-txt-faint">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Row>
                  )}
                </>
              )}

              {/* ── GPU ── */}
              {tab === "gpu" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-txt">Live GPU Status</span>
                    <button className="btn-ghost text-[10px] px-2 py-0.5 border border-border/50 rounded"
                      onClick={() => { setGpuInfo(null); setGpuLoading(true); api.gpuInfo().then(setGpuInfo).finally(() => setGpuLoading(false)); }}>
                      Refresh
                    </button>
                  </div>
                  {gpuLoading && (
                    <div className="text-xs text-txt-faint flex items-center gap-2">
                      <Spinner size={10} className="text-accent" />
                      <span>Loading GPU hardware information…</span>
                    </div>
                  )}
                  {gpuInfo && (
                    <div className="space-y-2 text-xs">
                      <div className={`px-3 py-2 rounded-lg border font-bold ${gpuInfo.available ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger"}`}>
                        {gpuInfo.available ? "✅ CUDA GPU Available" : "⚠️ CPU Only — No CUDA GPU detected"}
                      </div>
                      {gpuInfo.error && <div className="text-danger text-[10px] font-mono">{gpuInfo.error}</div>}
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["Device", gpuInfo.device_name || "N/A"],
                          ["CUDA Version", gpuInfo.cuda_version || "N/A"],
                          ["PyTorch", gpuInfo.torch_version || "N/A"],
                          ["Worker Python", gpuInfo.worker_python],
                        ].map(([k, v]) => (
                          <div key={k} className="p-2 rounded-md border border-border/40 bg-bg/20">
                            <div className="text-[9px] text-txt-faint uppercase font-bold">{k}</div>
                            <div className="text-txt font-mono text-[10px] truncate">{v}</div>
                          </div>
                        ))}
                      </div>
                      {gpuInfo.encoders.length > 0 && (
                        <Row label="Available Hardware Encoders">
                          <div className="flex flex-wrap gap-1.5">
                            {gpuInfo.encoders.map((enc) => (
                              <span key={enc} className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono">{enc}</span>
                            ))}
                          </div>
                        </Row>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── FFMPEG ── */}
              {tab === "ffmpeg" && (
                <div className="space-y-3 text-xs">
                  {health ? (
                    <>
                      <div className={`px-3 py-2 rounded-lg border font-bold ${health.ffmpeg ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger"}`}>
                        {health.ffmpeg ? "✅ FFmpeg binary found and operational" : "❌ FFmpeg binary not found — exports will fail"}
                      </div>
                      <Row label="FFmpeg Binary Path">
                        <div className="font-mono text-[10px] text-txt-faint bg-bg-elevated/40 px-2.5 py-1.5 rounded border border-border/30 break-all">{health.ffmpeg_path || "—"}</div>
                      </Row>
                      <Row label="Worker Python">
                        <div className="font-mono text-[10px] text-txt-faint bg-bg-elevated/40 px-2.5 py-1.5 rounded border border-border/30 break-all">{health.worker_python || "—"}</div>
                      </Row>
                      <Row label="Models Directory">
                        <div className="font-mono text-[10px] text-txt-faint bg-bg-elevated/40 px-2.5 py-1.5 rounded border border-border/30 break-all">{health.models_dir || "—"}</div>
                      </Row>
                    </>
                  ) : (
                    <div className="text-xs text-txt-faint flex items-center gap-2">
                      <Spinner size={10} className="text-accent" />
                      <span>Loading FFmpeg specifications…</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── CACHE ── */}
              {tab === "cache" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-txt">Cache Storage</span>
                    <div className="flex gap-1.5">
                      <button className="btn-ghost text-[10px] px-2 py-0.5 border border-border/50 rounded"
                        onClick={() => { setCacheInfo(null); api.cacheInfo().then(setCacheInfo).catch(() => {}); }}>
                        Refresh
                      </button>
                      <button className="text-[10px] px-2 py-0.5 border border-danger/40 text-danger rounded hover:bg-danger/10 flex items-center justify-center gap-1.5"
                        onClick={() => clearCache()} disabled={cacheClearing}>
                        {cacheClearing ? (
                          <>
                            <Spinner size={8} className="text-danger" />
                            <span>Clearing…</span>
                          </>
                        ) : (
                          <span>Clear All</span>
                        )}
                      </button>
                    </div>
                  </div>
                  {cacheInfo ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/40 bg-bg/20">
                        <span className="text-txt-faint">Total cached</span>
                        <span className="font-bold text-txt">{cacheInfo.total_mb.toFixed(1)} MB</span>
                      </div>
                      <div className="text-[9px] text-txt-faint font-bold uppercase mb-1">Cache Entries</div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {cacheInfo.entries.map((e) => (
                          <div key={e.name} className="flex items-center justify-between px-2.5 py-1.5 rounded border border-border/30 bg-bg/15 hover:bg-bg/30">
                            <div className="flex items-center gap-2 min-w-0">
                              <span>{e.is_dir ? "📁" : "📄"}</span>
                              <span className="font-mono text-[10px] text-txt truncate">{e.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-txt-faint text-[9px]">{e.size_mb.toFixed(1)} MB</span>
                              <button className="text-danger hover:underline text-[9px]"
                                onClick={() => clearCache(e.name)} disabled={cacheClearing}>
                                Clear
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-txt-faint flex items-center gap-2">
                      <Spinner size={10} className="text-accent" />
                      <span>Loading cache summary…</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── DOWNLOADS ── */}
              {tab === "downloads" && (
                <div className="space-y-3">
                  <p className="text-xs text-txt-faint font-semibold">Download AI models used for offline transcription and translation.</p>
                  {modelLib ? (
                    <div className="space-y-2">
                      {modelLib.models.filter((m) => m.downloadable).map((m) => (
                        <div key={m.key} className="p-3 rounded-lg border border-border/40 bg-bg/20 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-txt">{m.label}</div>
                              <div className="text-txt-faint text-[10px]">{m.note} · {m.size_mb > 0 ? `${m.size_mb} MB` : "size varies"}</div>
                            </div>
                            {m.installed ? (
                              <span className="text-[9px] font-bold text-success bg-success/10 px-2 py-0.5 rounded shrink-0">✓ Installed</span>
                            ) : (
                              <button
                                className="btn-primary text-[10px] px-3 py-1 rounded shrink-0 flex items-center justify-center gap-1.5"
                                onClick={() => downloadModel(m.key)}
                                disabled={dlRunning !== null}
                              >
                                {dlRunning === m.key ? (
                                  <>
                                    <Spinner size={8} className="text-white" />
                                    <span>Downloading…</span>
                                  </>
                                ) : (
                                  <span>⬇ Download</span>
                                )}
                              </button>
                            )}
                          </div>
                          {dlRunning === m.key && (
                            <div className="h-1.5 bg-bg-elevated rounded overflow-hidden">
                              <div
                                className="h-full bg-accent transition-all duration-300"
                                style={{ width: `${dlProgress[m.key] ?? 0}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-txt-faint flex items-center gap-2">
                      <Spinner size={10} className="text-accent" />
                      <span>Loading model catalog…</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── BACKUP ── */}
              {tab === "backup" && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-lg border border-border/40 bg-bg/20 space-y-2">
                    <div className="font-bold text-txt">💾 Export Settings Backup</div>
                    <p className="text-txt-faint">Downloads a complete JSON snapshot of all current settings to your device.</p>
                    <button className="btn-primary text-xs py-1.5 px-4 rounded font-semibold mt-1" onClick={backupSettings}>
                      Download Settings Backup
                    </button>
                  </div>
                  <div className="p-3 rounded-lg border border-border/30 bg-bg/10 text-[10px] text-txt-faint">
                    <strong className="text-txt">Backup includes:</strong> language, theme, API model names, translation engine toggles, custom instructions, and update preferences. API keys are excluded for security.
                  </div>
                </div>
              )}

              {/* ── RESTORE ── */}
              {tab === "restore" && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-lg border border-border/40 bg-bg/20 space-y-2">
                    <div className="font-bold text-txt">♻️ Restore Settings from Backup</div>
                    <p className="text-txt-faint">Import a previously saved settings JSON file to restore your configuration.</p>
                    <input
                      ref={restoreRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleRestore(f);
                        e.target.value = "";
                      }}
                    />
                    <button className="btn-ghost text-xs py-1.5 px-4 rounded border border-border/60 font-semibold mt-1"
                      onClick={() => restoreRef.current?.click()}>
                      Select Backup JSON File…
                    </button>
                    {restoreMsg && (
                      <div className={`mt-2 text-xs font-bold ${restoreMsg.startsWith("✅") ? "text-success" : "text-danger"}`}>
                        {restoreMsg}
                      </div>
                    )}
                  </div>
                  <div className="p-3 rounded-lg border border-danger/20 bg-danger/5 text-[10px] text-danger/80">
                    ⚠️ Restoring will overwrite your current settings with the values from the backup file. This cannot be undone.
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-bg/25 shrink-0 text-xs">
          <span className="text-[10px] text-txt-faint font-semibold uppercase">Settings autosave on close</span>
          <div className="flex gap-2">
            <button className="btn-ghost px-4 py-1.5 rounded border border-border/60 text-xs hover:bg-bg-hover" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary px-4 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5" onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Spinner size={10} className="text-white" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <span>💾 Save Settings</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
