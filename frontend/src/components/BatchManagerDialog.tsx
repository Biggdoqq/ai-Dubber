import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, pollJob } from "../api/client";
import type { Job } from "../api/types";

interface Props {
  onClose?: () => void;
  notify: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
  inline?: boolean;
}

type JobType = "videos" | "translate" | "export" | "mp3";
type ItemStatus = "pending" | "running" | "done" | "error" | "cancelled";

interface QueueItem {
  id: number;
  type: JobType;
  label: string;
  status: ItemStatus;
  progress: number;
  message: string;
  startedAt?: number;
  durationSec?: number;
  etaSec?: number;
  folder?: string;
  files?: string[];
  videos?: string[];
  outputFolder?: string;
  sourceLang?: string;
  targetLang?: string;
  engine?: string;
  quality?: string;
  burnSubs?: boolean;
  useGpu?: boolean;
}

interface HistoryEntry {
  id: number;
  type: JobType;
  label: string;
  status: "done" | "error" | "cancelled";
  message: string;
  finishedAt: number;
  durationSec: number;
}

const TYPE_LABELS: Record<JobType, string> = {
  videos: "Batch Video Mux",
  translate: "Batch Translate",
  export: "Batch Export MP3",
  mp3: "Batch Audio Extract",
};

const LANGS: [string, string][] = [
  ["auto", "Auto-Detect"], ["km", "Khmer"], ["en", "English"], ["th", "Thai"],
  ["vi", "Vietnamese"], ["zh-CN", "Chinese (Simp.)"], ["ja", "Japanese"],
  ["ko", "Korean"], ["fr", "French"], ["es", "Spanish"], ["de", "German"],
];

const ENGINES: [string, string][] = [
  ["google", "Google Translate"], ["groq", "Groq LLM"], ["gemini", "Gemini"], ["nllb", "NLLB-200 (offline)"],
];

const QUALITIES = ["original", "mobile", "720p", "1080p", "4k"];

const statusBadge: Record<ItemStatus, string> = {
  pending: "bg-bg-elevated/80 text-txt-faint border border-border/40",
  running: "bg-accent/25 text-accent border border-accent/40 animate-pulse",
  done: "bg-success/20 text-success border border-success/30",
  error: "bg-danger/20 text-danger border border-danger/30",
  cancelled: "bg-bg-elevated text-txt-muted border border-border/30",
};

const HISTORY_KEY = "batch_history";
const lines = (s: string) => s.split("\n").map((p) => p.trim()).filter(Boolean);

const fmtDuration = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) return "—";
  const r = Math.round(sec);
  if (r < 60) return `${r}s`;
  const m = Math.floor(r / 60);
  const s = r % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const fmtClock = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function BatchManagerDialog({ onClose, notify, inline = false }: Props) {
  const [type, setType] = useState<JobType>("videos");
  
  // Folders and paths configuration states
  const [folder, setFolder] = useState("");
  const [pathsText, setPathsText] = useState("");
  const [outputFolder, setOutputFolder] = useState("");
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("km");
  const [engine, setEngine] = useState("google");
  const [quality, setQuality] = useState("original");
  const [burnSubs, setBurnSubs] = useState(false);
  const [useGpu, setUseGpu] = useState(true);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const queueRef = useRef<QueueItem[]>([]);
  const pausedRef = useRef(false);
  const currentJobIdRef = useRef<string | null>(null);
  const idRef = useRef(1);

  // Load history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore corrupt history
    }
  }, []);

  const pushHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 50);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // quota
      }
      return next;
    });
  }, []);

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
  };

  const syncSet = useCallback((updater: (prev: QueueItem[]) => QueueItem[]) => {
    setQueue((prev) => {
      const next = updater(prev);
      queueRef.current = next;
      return next;
    });
  }, []);

  const patchItem = useCallback((id: number, patch: Partial<QueueItem>) => {
    syncSet((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, [syncSet]);

  const addToQueue = () => {
    const id = idRef.current++;
    let item: QueueItem | null = null;
    if (type === "videos" || type === "export") {
      if (!folder.trim()) return notify("Enter folder path target", "warning");
      item = {
        id,
        type,
        status: "pending",
        progress: 0,
        message: "",
        label: `${TYPE_LABELS[type]} — ${folder.trim()}`,
        folder: folder.trim(),
        ...(type === "videos" ? { quality, burnSubs, useGpu } : {}),
      };
    } else if (type === "translate") {
      const files = lines(pathsText);
      if (files.length === 0) return notify("Enter one .srt path per line", "warning");
      item = {
        id,
        type,
        status: "pending",
        progress: 0,
        message: "",
        label: `${TYPE_LABELS[type]} — ${files.length} file(s) → ${targetLang}`,
        files,
        sourceLang,
        targetLang,
        engine,
      };
    } else if (type === "mp3") {
      const videos = lines(pathsText);
      if (videos.length === 0) return notify("Enter one video path per line", "warning");
      if (!outputFolder.trim()) return notify("Enter output folder target", "warning");
      item = {
        id,
        type,
        status: "pending",
        progress: 0,
        message: "",
        label: `${TYPE_LABELS[type]} — ${videos.length} video(s)`,
        videos,
        outputFolder: outputFolder.trim(),
      };
    }
    if (item) {
      syncSet((prev) => [...prev, item!]);
      notify("Added to batch queue", "success");
    }
  };

  const startJob = (item: QueueItem): Promise<{ job_id: string }> => {
    switch (item.type) {
      case "videos":
        return api.batchFolderExport(item.folder!, {
          mode: "video",
          quality: item.quality,
          burn_subtitles: item.burnSubs,
          use_gpu: item.useGpu,
        });
      case "export":
        return api.batchFolderExport(item.folder!, { mode: "mp3" });
      case "translate":
        return api.batchTranslateSrt(item.files!, item.sourceLang!, item.targetLang!, item.engine!);
      case "mp3":
        return api.batchVideoToMp3(item.videos!, item.outputFolder!);
    }
  };

  const summarize = (job: Job): string => {
    const r = job.result as { ok?: number; fail?: number; skipped?: string[] } | null;
    if (r && typeof r.ok === "number") {
      const skip = r.skipped?.length ? `, ${r.skipped.length} skipped (no SRT)` : "";
      return `${r.ok} ok, ${r.fail ?? 0} failed${skip}`;
    }
    return job.message || "done";
  };

  const runQueue = useCallback(async () => {
    setProcessing(true);
    pausedRef.current = false;
    setPaused(false);
    while (!pausedRef.current) {
      const next = queueRef.current.find((it) => it.status === "pending");
      if (!next) break;
      const started = Date.now();
      patchItem(next.id, {
        status: "running",
        progress: 0,
        message: "Initializing…",
        startedAt: started,
        etaSec: undefined,
      });
      let finalStatus: HistoryEntry["status"] = "done";
      let finalMessage = "";
      try {
        const { job_id } = await startJob(next);
        currentJobIdRef.current = job_id;
        const final = await pollJob(job_id, (j) => {
          const elapsed = (Date.now() - started) / 1000;
          const etaSec =
            j.progress > 3 && j.progress < 100 ? (elapsed * (100 - j.progress)) / j.progress : undefined;
          patchItem(next.id, { progress: j.progress, message: j.message, etaSec });
        });
        const cancelled =
          final.status === "cancelled" || (final.result as { cancelled?: boolean } | null)?.cancelled === true;
        finalStatus = cancelled ? "cancelled" : final.status === "error" ? "error" : "done";
        finalMessage = final.status === "error" ? final.error?.split("\n")[0] || "error" : summarize(final);
      } catch (e) {
        finalStatus = "error";
        finalMessage = `${e}`.split("\n")[0];
      }
      currentJobIdRef.current = null;
      const durationSec = (Date.now() - started) / 1000;
      patchItem(next.id, {
        status: finalStatus,
        progress: finalStatus === "done" ? 100 : next.progress,
        message: finalMessage,
        etaSec: undefined,
        durationSec,
      });
      pushHistory({
        id: next.id,
        type: next.type,
        label: next.label,
        status: finalStatus,
        message: finalMessage,
        finishedAt: Date.now(),
        durationSec,
      });
    }
    setProcessing(false);
  }, [patchItem, pushHistory]);

  const pause = () => {
    pausedRef.current = true;
    setPaused(true);
  };

  const cancelCurrent = async () => {
    if (currentJobIdRef.current) {
      await api.cancelJob(currentJobIdRef.current).catch(() => {});
      notify("Aborting current task…", "warning");
    }
  };

  const retryItem = (id: number) =>
    patchItem(id, {
      status: "pending",
      progress: 0,
      message: "",
      etaSec: undefined,
      durationSec: undefined,
      startedAt: undefined,
    });

  const retryFailed = () => {
    const failed = queueRef.current.filter((it) => it.status === "error" || it.status === "cancelled");
    if (failed.length === 0) return notify("No failed items to retry", "warning");
    syncSet((prev) =>
      prev.map((it) =>
        it.status === "error" || it.status === "cancelled"
          ? {
              ...it,
              status: "pending",
              progress: 0,
              message: "",
              etaSec: undefined,
              durationSec: undefined,
              startedAt: undefined,
            }
          : it
      )
    );
    notify(`${failed.length} item(s) queued for retry`, "success");
  };

  const removeItem = (id: number) => syncSet((prev) => prev.filter((it) => it.id !== id));
  const clearFinished = () =>
    syncSet((prev) => prev.filter((it) => it.status === "pending" || it.status === "running"));

  const stats = useMemo(() => {
    const s = { pending: 0, running: 0, done: 0, error: 0, cancelled: 0 };
    queue.forEach((it) => s[it.status]++);
    return s;
  }, [queue]);

  const failedCount = stats.error + stats.cancelled;

  const totalEtaSec = useMemo(() => {
    const completed = queue.filter((it) => it.durationSec != null);
    const avg = completed.length
      ? completed.reduce((sum, it) => sum + it.durationSec!, 0) / completed.length
      : null;
    const running = queue.find((it) => it.status === "running");
    let total = 0;
    let known = false;
    if (running?.etaSec != null) {
      total += running.etaSec;
      known = true;
    }
    if (avg != null && stats.pending > 0) {
      total += avg * stats.pending;
      known = true;
    }
    return known ? total : null;
  }, [queue, stats.pending]);

  const isFolder = type === "videos" || type === "export";
  const isTranslate = type === "translate";
  const isMp3 = type === "mp3";

  const innerContent = (
    <>
        {/* category selector tabs */}
        <div className="flex border-b border-border bg-bg/25 text-xs shrink-0">
          {(Object.keys(TYPE_LABELS) as JobType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 text-center transition-colors font-medium border-b-2 ${
                type === t
                  ? "border-accent text-accent bg-accent/5 font-semibold"
                  : "border-transparent text-txt-muted hover:text-txt hover:bg-bg-hover/20"
              }`}
            >
              {t === "videos" ? "🎬" : t === "translate" ? "🌐" : t === "export" ? "🎵" : "🌊"} {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 overflow-auto flex-1 flex flex-col min-h-0">
          
          {/* configuration forms */}
          <section className="bg-bg/25 border border-border/40 rounded-lg p-3.5 space-y-3 shrink-0">
            {isFolder && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="label w-24 shrink-0 font-semibold">Source Folder:</span>
                  <input
                    className="input flex-1 font-mono text-xs py-1 px-2.5 rounded bg-bg-elevated/40"
                    placeholder="C:\\projects\\videos_folder  (contains matching video + srt file pairs)"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                  />
                </div>
                {type === "videos" && (
                  <div className="flex items-center gap-4 flex-wrap text-xs pt-1">
                    <div className="flex items-center gap-2">
                      <span className="label">Quality</span>
                      <select className="input py-0.5 bg-bg-elevated/40 text-xs" value={quality} onChange={(e) => setQuality(e.target.value)}>
                        {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-txt font-semibold cursor-pointer">
                      <input type="checkbox" className="accent-accent" checked={burnSubs} onChange={(e) => setBurnSubs(e.target.checked)} />
                      Burn subtitles
                    </label>
                    <label className="flex items-center gap-2 text-txt font-semibold cursor-pointer">
                      <input type="checkbox" className="accent-accent" checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} />
                      Hardware Accel (GPU)
                    </label>
                  </div>
                )}
                <p className="text-[10px] text-txt-faint font-semibold">
                  Scans target folder matching name.mp4 + name.srt to generate dubbed deliverables.
                </p>
              </>
            )}

            {isTranslate && (
              <>
                <textarea
                  className="input w-full h-20 resize-none font-mono text-xs py-1.5 px-2.5 rounded bg-bg-elevated/40"
                  placeholder={"Enter one subtitle path per line, e.g.:\nC:\\projects\\ep1.srt\nC:\\projects\\ep2.srt"}
                  value={pathsText}
                  onChange={(e) => setPathsText(e.target.value)}
                />
                <div className="flex items-center gap-4 flex-wrap text-xs pt-1">
                  <div className="flex items-center gap-2">
                    <span className="label font-semibold">Source:</span>
                    <select className="input py-0.5 bg-bg-elevated/40 text-xs" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                      {LANGS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="label font-semibold">Target:</span>
                    <select className="input py-0.5 bg-bg-elevated/40 text-xs" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                      {LANGS.filter(([k]) => k !== "auto").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="label font-semibold">Engine:</span>
                    <select className="input py-0.5 bg-bg-elevated/40 text-xs font-mono" value={engine} onChange={(e) => setEngine(e.target.value)}>
                      {ENGINES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {isMp3 && (
              <>
                <textarea
                  className="input w-full h-20 resize-none font-mono text-xs py-1.5 px-2.5 rounded bg-bg-elevated/40"
                  placeholder={"Enter one video path per line, e.g.:\nC:\\projects\\ep1.mp4\nC:\\projects\\ep2.mp4"}
                  value={pathsText}
                  onChange={(e) => setPathsText(e.target.value)}
                />
                <div className="flex items-center gap-2 text-xs pt-1">
                  <span className="label w-24 shrink-0 font-semibold">Output Folder:</span>
                  <input
                    className="input flex-1 font-mono text-xs py-1 px-2.5 rounded bg-bg-elevated/40"
                    placeholder="C:\\videos\\audio_deliverables"
                    value={outputFolder}
                    onChange={(e) => setOutputFolder(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="flex justify-end pt-1">
              <button className="btn-primary py-1 px-3.5 text-xs font-semibold rounded shadow-md" onClick={addToQueue}>
                ➕ Add to Queue
              </button>
            </div>
          </section>

          {/* queue monitor */}
          <section className="bg-bg/25 border border-border/40 rounded-lg p-3.5 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border/30 pb-2 mb-2">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold text-txt">Active Queue ({queue.length})</h3>
                <div className="flex items-center gap-1 text-[9px] font-bold uppercase">
                  {stats.pending > 0 && <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-txt-faint">{stats.pending} pending</span>}
                  {stats.running > 0 && <span className="px-1.5 py-0.5 rounded bg-accent/25 text-accent animate-pulse">{stats.running} running</span>}
                  {stats.done > 0 && <span className="px-1.5 py-0.5 rounded bg-success/20 text-success">{stats.done} done</span>}
                  {failedCount > 0 && <span className="px-1.5 py-0.5 rounded bg-danger/20 text-danger">{failedCount} failed</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                {!processing ? (
                  <button className="btn-ghost py-0.5 px-2.5 rounded border border-border/50 text-[10px]" onClick={runQueue} disabled={stats.pending === 0}>
                    {paused ? "▶ Resume" : "▶ Run"}
                  </button>
                ) : (
                  <button className="btn-ghost py-0.5 px-2.5 rounded border border-border/50 text-[10px]" onClick={pause} disabled={paused}>
                    ⏸ Pause
                  </button>
                )}
                <button className="btn-ghost py-0.5 px-2.5 rounded border border-danger/20 text-danger text-[10px] hover:bg-danger/5" onClick={cancelCurrent} disabled={!processing}>
                  ✖ Cancel
                </button>
                <button className="btn-ghost py-0.5 px-2.5 rounded border border-border/50 text-[10px]" onClick={retryFailed} disabled={processing || failedCount === 0}>
                  ↻ Retry Failed
                </button>
                <button className="btn-ghost py-0.5 px-2.5 rounded border border-border/50 text-[10px]" onClick={clearFinished} disabled={processing}>
                  Clear Finished
                </button>
              </div>
            </div>

            {queue.length === 0 ? (
              <div className="text-xs text-txt-faint py-12 text-center font-medium my-auto">
                No active jobs in the queue. Add one using the form above.
              </div>
            ) : (
              <div className="space-y-2 overflow-auto flex-1 pr-1.5">
                {queue.map((it) => (
                  <div key={it.id} className="p-2 border border-border/50 bg-bg-panel/40 rounded-md">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${statusBadge[it.status]}`}>
                        {it.status}
                      </span>
                      <span className="text-txt font-semibold truncate flex-1">{it.label}</span>
                      {it.status === "running" && (
                        <span className="text-[10px] text-accent shrink-0 font-mono">
                          {it.progress}% {it.etaSec != null && `· ETA: ${fmtDuration(it.etaSec)}`}
                        </span>
                      )}
                      {(it.status === "done" || it.status === "error" || it.status === "cancelled") && it.durationSec != null && (
                        <span className="text-[10px] text-txt-faint shrink-0 font-mono">{fmtDuration(it.durationSec)}</span>
                      )}
                      {(it.status === "error" || it.status === "cancelled") && (
                        <button className="text-accent hover:underline text-[10px] shrink-0 font-bold" onClick={() => retryItem(it.id)}>
                          Retry
                        </button>
                      )}
                      {(it.status === "pending" || it.status === "done" || it.status === "error" || it.status === "cancelled") && (
                        <button className="text-txt-faint hover:text-danger text-[10px] shrink-0 font-bold" onClick={() => removeItem(it.id)}>
                          Remove
                        </button>
                      )}
                    </div>
                    {(it.status === "running" || it.status === "done" || it.status === "error") && (
                      <div className="mt-1.5">
                        <div className="h-1 bg-bg-elevated rounded overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${it.status === "error" ? "bg-danger" : "bg-accent"}`}
                            style={{ width: `${it.status === "done" ? 100 : it.progress}%` }}
                          />
                        </div>
                        {it.message && (
                          <div className={`mt-1 text-[9px] font-mono truncate ${it.status === "error" ? "text-danger" : "text-txt-faint"}`}>
                            {it.message}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* history logs */}
          <section className="bg-bg/25 border border-border/40 rounded-lg p-3.5 shrink-0">
            <div className="flex items-center justify-between border-b border-border/30 pb-1.5 mb-1.5">
              <button
                className="text-xs font-bold text-txt flex items-center gap-1"
                onClick={() => setShowHistory((v) => !v)}
              >
                <span className={`inline-block transition-transform ${showHistory ? "rotate-90" : ""}`}>▶</span>
                Execution History Logs ({history.length})
              </button>
              {history.length > 0 && (
                <button className="text-danger hover:underline text-[10px]" onClick={clearHistory}>Clear logs</button>
              )}
            </div>
            {showHistory && (
              history.length === 0 ? (
                <div className="text-[10px] text-txt-faint py-3 text-center font-medium">No completed items.</div>
              ) : (
                <div className="space-y-1 max-h-24 overflow-y-auto divide-y divide-border/20 font-mono text-[9px]">
                  {history.map((h, i) => (
                    <div key={`${h.id}-${i}`} className="flex items-center justify-between gap-3 py-1">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-txt-faint">{fmtClock(h.finishedAt)}</span>
                        <span className={h.status === "done" ? "text-success" : "text-danger"}>
                          {h.status === "done" ? "[OK]" : "[FAIL]"}
                        </span>
                        <span className="text-txt truncate" title={h.label}>{h.label}</span>
                      </div>
                      <span className="text-txt-faint shrink-0">{fmtDuration(h.durationSec)}</span>
                    </div>
                  ))}
                </div>
              )
            )}
          </section>
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-transparent text-xs h-full w-full overflow-hidden">
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="panel w-[800px] max-w-full max-h-[90vh] flex flex-col shadow-2xl border border-border/85 bg-bg-panel/95 rounded-xl">
        
        {/* dialog header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/15 to-transparent">
          <div>
            <h2 className="text-sm font-bold text-txt flex items-center gap-1.5">
              <span>📦</span> Batch Processing Dashboard
            </h2>
            <p className="text-[10px] text-txt-faint uppercase font-bold mt-0.5">
              Configure queues, monitor progress, and batch convert folders
            </p>
          </div>
          {onClose && <button className="text-txt-faint hover:text-txt text-lg transition-colors" onClick={onClose}>✕</button>}
        </div>

        {innerContent}

        {/* dialog footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-bg/20 text-xs">
          <span className="text-[10px] text-txt-faint font-semibold uppercase">
            {processing
              ? paused
                ? "⏸ Paused — finishing active task segment…"
                : totalEtaSec != null
                  ? `🚀 Processing · ETA: ${fmtDuration(totalEtaSec)}`
                  : "🚀 Processing batch queue…"
              : paused
                ? `⏸ Queue Paused · ${stats.pending} task(s) pending`
                : `⏱️ ${stats.pending} task(s) pending`}
          </span>
          {onClose && (
            <button className="btn-ghost px-4 py-1.5 rounded border border-border/60 text-xs text-txt hover:bg-bg-hover" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
