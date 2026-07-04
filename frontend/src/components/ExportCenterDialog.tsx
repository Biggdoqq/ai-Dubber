import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";
import type { Subtitle } from "../api/types";
import Spinner from "./Spinner";

interface Props {
  rows: Subtitle[];
  videoPath: string | null;
  videoName: string | null;
  videoDuration: number;
  audioDelayMs: number;
  onClose: () => void;
  notify: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
}

type ExportId = "video" | "mp3" | "wav" | "subtitles" | "project";
type PresetId = "youtube" | "tiktok" | "audio_hq" | "draft" | "custom";

interface QueueItem {
  id: string;
  format: "mp4" | "mp3" | "wav" | "aivd";
  path: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  error?: string;
  params: any;
  eta?: string;
}

interface HistoryItem {
  id: string;
  name: string;
  format: string;
  path: string;
  timestamp: string;
  status: "done" | "error" | "pending";
  error?: string;
  params: any;
}

const EXPORTS: { id: ExportId; icon: string; label: string; desc: string }[] = [
  { id: "video", icon: "🎬", label: "Export Video", desc: "Mux the AI dub onto the video (.mp4), optional burned-in subtitles." },
  { id: "mp3", icon: "🎵", label: "Export MP3", desc: "Render the dubbed audio track to a compressed .mp3 (320k)." },
  { id: "wav", icon: "🌊", label: "Export WAV", desc: "Render the dubbed audio track to lossless PCM .wav." },
  { id: "subtitles", icon: "📄", label: "Export Subtitles", desc: "Download the current rows as an .srt file (browser download)." },
  { id: "project", icon: "🗂", label: "Export Project", desc: "Save the full project (video + rows) as a .aivd file on the server." },
];

const PRESETS: { id: PresetId; label: string; desc: string }[] = [
  { id: "youtube", label: "📺 YouTube HQ (1080p)", desc: "High Quality 1080p, CPU H264 encode" },
  { id: "tiktok", label: "📱 TikTok (Vertical)", desc: "Vertical optimized mobile mp4" },
  { id: "audio_hq", label: "🎧 HQ Audio (320kbps)", desc: "High Quality dubbing audio stream" },
  { id: "draft", label: "⚡ Fast Draft (480p)", desc: "Low-res, quick GPU rendering" },
  { id: "custom", label: "⚙️ Custom Settings", desc: "Manually configure encoding parameters" },
];

const QUALITY_PRESETS = [
  { id: "original", label: "Original" },
  { id: "mobile", label: "Mobile (480p)" },
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p HD" },
  { id: "4k", label: "4K UHD" },
];

const ENCODERS = [
  { id: "auto", label: "Auto (GPU if available)" },
  { id: "h264_nvenc", label: "NVIDIA GPU (h264_nvenc)" },
  { id: "h264_mf", label: "Windows Media Foundation (h264_mf)" },
  { id: "h264_qsv", label: "Intel GPU (h264_qsv)" },
  { id: "libx264", label: "CPU (libx264)" },
];

export default function ExportCenterDialog({
  rows,
  videoPath,
  videoName,
  videoDuration,
  audioDelayMs,
  onClose,
  notify,
}: Props) {
  const [active, setActive] = useState<ExportId>("video");
  const [activePreset, setActivePreset] = useState<PresetId>("custom");

  // output directory configurations
  const [outputFolder, setOutputFolder] = useState("C:\\exports\\");
  const [outputFileName, setOutputFileName] = useState("export");

  // export configs
  const [quality, setQuality] = useState("original");
  const [burnSubs, setBurnSubs] = useState(false);
  const [encoder, setEncoder] = useState("auto");
  const [fontSize, setFontSize] = useState(28);
  const [dubVolume, setDubVolume] = useState(100);
  const [autoSync, setAutoSync] = useState(true);

  const job = useJob();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentQueueId, setCurrentQueueId] = useState<string | null>(null);

  const busy = currentQueueId !== null || job.running;

  // Load history on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("export_history");
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  // Update default output folder when videoPath is loaded
  useEffect(() => {
    if (videoPath) {
      const lastSlash = Math.max(videoPath.lastIndexOf("\\"), videoPath.lastIndexOf("/"));
      const folder = videoPath.substring(0, lastSlash + 1) || "C:\\exports\\";
      const name = videoPath.substring(lastSlash + 1).replace(/\.[^.]+$/, "") || "video";
      setOutputFolder(folder);
      setOutputFileName(name);
    } else {
      setOutputFolder("C:\\exports\\");
      setOutputFileName("export");
    }
  }, [videoPath]);

  // Apply preset parameters
  const applyPreset = (pid: PresetId) => {
    setActivePreset(pid);
    if (pid === "youtube") {
      setQuality("1080p");
      setEncoder("libx264");
      setBurnSubs(true);
      setFontSize(28);
      setDubVolume(100);
      setAutoSync(true);
      setActive("video");
    } else if (pid === "tiktok") {
      setQuality("720p");
      setEncoder("auto");
      setBurnSubs(true);
      setFontSize(24);
      setDubVolume(105);
      setAutoSync(true);
      setActive("video");
    } else if (pid === "audio_hq") {
      setDubVolume(100);
      setAutoSync(true);
      setActive("mp3");
    } else if (pid === "draft") {
      setQuality("mobile");
      setEncoder("auto");
      setBurnSubs(false);
      setDubVolume(100);
      setAutoSync(false);
      setActive("video");
    }
  };

  // Quick path presets helpers
  const applyPathPreset = (folder: "desktop" | "project") => {
    if (folder === "desktop") {
      setOutputFolder("C:\\Users\\heang\\Desktop\\");
    } else if (videoPath) {
      const lastSlash = Math.max(videoPath.lastIndexOf("\\"), videoPath.lastIndexOf("/"));
      setOutputFolder(videoPath.substring(0, lastSlash + 1) || "C:\\exports\\");
    }
  };

  // ETA tracking
  const startTimeRef = useRef<number | null>(null);
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    if (job.running && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
      setEta(null);
    }
    if (!job.running) {
      startTimeRef.current = null;
      setEta(null);
      return;
    }
    const pct = job.job?.progress ?? 0;
    if (pct > 2 && startTimeRef.current !== null) {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const totalEst = elapsed / (pct / 100);
      const rem = Math.max(0, Math.round(totalEst - elapsed));
      if (rem >= 60) {
        const m = Math.floor(rem / 60);
        const s = rem % 60;
        setEta(`~${m}m ${s}s remaining`);
      } else {
        setEta(rem > 3 ? `~${rem}s remaining` : "Almost done…");
      }
    }
  }, [job.running, job.job?.progress]);

  // Sync running queue item progress with active job progress
  useEffect(() => {
    if (!currentQueueId || !job.running) return;
    setQueue((prev) =>
      prev.map((q) =>
        q.id === currentQueueId
          ? {
              ...q,
              progress: job.job?.progress ?? 0,
              message: job.job?.message || "Processing…",
              eta: eta || undefined,
            }
          : q
      )
    );
  }, [job.job?.progress, job.job?.message, eta, currentQueueId, job.running]);

  // Queue runner worker
  useEffect(() => {
    if (currentQueueId) return;
    const nextItem = queue.find((q) => q.status === "queued");
    if (!nextItem) return;

    runQueueItem(nextItem);
  }, [queue, currentQueueId]);

  const addHistory = (item: HistoryItem) => {
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, 15);
      try {
        localStorage.setItem("export_history", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const getOutPath = (fmt: "mp4" | "mp3" | "wav" | "aivd") => {
    return `${outputFolder}${outputFileName}_dubbed.${fmt}`;
  };

  const addToQueue = (format: "mp4" | "mp3" | "wav" | "aivd") => {
    if (!videoPath) return notify("Load a video first", "warning");
    if (rows.length === 0 && format !== "aivd") return notify("No subtitles to export", "warning");

    const outPath = getOutPath(format);
    const newId = Math.random().toString(36).substr(2, 9);
    
    const item: QueueItem = {
      id: newId,
      format,
      path: outPath,
      status: "queued",
      progress: 0,
      message: "Queued",
      params: { quality, encoder, burnSubs, fontSize, dubVolume, autoSync },
    };

    setQueue((prev) => [...prev, item]);
    notify(`Added ${format.toUpperCase()} export to queue`, "info");
  };

  const runQueueItem = async (item: QueueItem) => {
    setCurrentQueueId(item.id);
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: "running", progress: 0 } : q))
    );

    let final: any = null;
    try {
      if (item.format === "mp4") {
        final = await job.start(() =>
          api.exportVideo(rows, videoPath!, item.path, {
            video_duration: videoDuration,
            dub_volume: item.params.dubVolume,
            auto_sync_speed: item.params.autoSync,
            audio_start_offset_ms: audioDelayMs,
            burn_subtitles: item.params.burnSubs,
            quality: item.params.quality,
            use_gpu: item.params.encoder === "auto" || item.params.encoder !== "libx264",
            video_encoder: item.params.encoder === "auto" ? undefined : item.params.encoder,
            subtitle_font_size: item.params.fontSize,
          })
        );
      } else if (item.format === "mp3" || item.format === "wav") {
        final = await job.start(() =>
          api.exportAudio(rows, videoDuration, item.path, {
            dub_volume: item.params.dubVolume,
            auto_sync_speed: item.params.autoSync,
            audio_start_offset_ms: audioDelayMs,
            audio_format: item.format as "mp3" | "wav",
          })
        );
      } else {
        // aivd project save
        await api.saveProject(videoPath || "", rows, item.path);
        final = { status: "done", error: null };
      }

      const isDone = final.status === "done";
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: isDone ? "done" : "error",
                progress: isDone ? 100 : q.progress,
                error: final.error || undefined,
              }
            : q
        )
      );

      // Add to history
      addHistory({
        id: item.id,
        name: item.path.split(/[\\/]/).pop() || "export",
        format: item.format,
        path: item.path,
        status: isDone ? "done" : "error",
        error: final.error || undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        params: item.params,
      });

      if (isDone) {
        notify(`Export finished: ${item.path}`, "success");
        if (item.format === "mp3" || item.format === "wav") {
          triggerDownload(item.path, item.format);
        }
      } else {
        notify(`Export failed: ${final.error?.split("\n")[0] || ""}`, "error");
      }
    } catch (e) {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "error", error: String(e) } : q))
      );
      notify(`Export failed: ${String(e)}`, "error");
    } finally {
      setCurrentQueueId(null);
    }
  };

  const cancelQueueItem = (id: string) => {
    if (id === currentQueueId) {
      job.cancel();
    }
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: "cancelled" } : q))
    );
    notify("Export cancelled", "info");
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const triggerDownload = (filePath: string, format: string) => {
    const downloadUrl = `/api/media/stream?path=${encodeURIComponent(filePath)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filePath.split(/[\\/]/).pop() || `dub.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportSrt = async () => {
    if (rows.length === 0) return notify("No subtitles to export", "warning");
    try {
      const srt = await api.buildSrt(rows);
      const blobUrl = URL.createObjectURL(new Blob([srt], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${videoName ? videoName.replace(/\.[^.]+$/, "") : "subtitles"}.srt`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      notify("Subtitles downloaded", "success");
    } catch (e) {
      notify(`SRT export failed: ${String(e).split("\n")[0]}`, "error");
    }
  };

  const retryQueueItem = (item: QueueItem) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: "queued", progress: 0, error: undefined } : q))
    );
  };

  const clearHistory = () => {
    try {
      localStorage.removeItem("export_history");
      setHistory([]);
      notify("Cleared export history", "info");
    } catch {
      // ignore
    }
  };

  const active_ = EXPORTS.find((e) => e.id === active)!;
  const noRows = rows.length === 0;
  const noVideo = !videoPath || videoDuration <= 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="panel w-[920px] max-w-full max-h-[92vh] flex flex-col shadow-2xl rounded-xl border border-border/80 bg-bg-panel/95">
        
        {/* dialog header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/10 to-transparent shrink-0">
          <div>
            <h2 className="text-sm font-bold text-txt flex items-center gap-1.5">
              <span>📤</span> Export Production Center
            </h2>
            <p className="text-[10px] text-txt-faint font-semibold uppercase mt-0.5">
              {rows.length} subtitles · {videoName ? videoName : "no video loaded"}
            </p>
          </div>
          <button className="text-txt-faint hover:text-txt text-lg transition-colors" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* left navigation tabs */}
          <nav className="w-48 shrink-0 border-r border-border/50 overflow-auto p-2.5 bg-bg/10 space-y-1">
            <span className="text-[9px] font-bold text-txt-faint uppercase px-2.5 py-1 block">Output Format</span>
            {EXPORTS.map((e) => (
              <button
                key={e.id}
                onClick={() => setActive(e.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                  active === e.id ? "bg-accent/15 text-accent font-semibold" : "text-txt-muted hover:text-txt hover:bg-bg-hover/20"
                }`}
              >
                <span className="text-sm shrink-0">{e.icon}</span>
                <span className="truncate">{e.label}</span>
              </button>
            ))}
          </nav>

          {/* main form panel */}
          <div className="flex-1 overflow-auto p-5 min-h-0 flex flex-col gap-4">
            
            {/* presets strip */}
            {(active === "video" || active === "mp3") && (
              <div className="bg-bg/25 border border-border/50 rounded-lg p-2.5 flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-txt-faint uppercase">🚀 Fast Export Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      className={`px-2.5 py-1 text-[10px] font-semibold border rounded-md transition-colors ${
                        activePreset === p.id
                          ? "bg-accent/25 text-accent border-accent/40"
                          : "text-txt-muted border-border/40 hover:bg-bg-hover"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2.5">
              <span className="text-2xl">{active_.icon}</span>
              <div>
                <h3 className="text-xs font-bold text-txt">{active_.label}</h3>
                <p className="text-[10px] text-txt-muted mt-0.5">{active_.desc}</p>
              </div>
            </div>

            {/* folder & name picker layout */}
            {active !== "subtitles" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-bg/15 border border-border/30 rounded-lg p-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Output Directory</label>
                    <div className="flex gap-1">
                      <button className="btn-ghost text-[8px] border border-border/40 px-2 py-0.5 rounded" onClick={() => applyPathPreset("desktop")}>Desktop</button>
                      <button className="btn-ghost text-[8px] border border-border/40 px-2 py-0.5 rounded" onClick={() => applyPathPreset("project")}>Project</button>
                    </div>
                  </div>
                  <input
                    className="input w-full font-mono text-[10px] py-1 px-2.5"
                    value={outputFolder}
                    onChange={(e) => setOutputFolder(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1.5">Output Filename</label>
                  <input
                    className="input w-full font-mono text-[10px] py-1 px-2.5"
                    value={outputFileName}
                    onChange={(e) => setOutputFileName(e.target.value)}
                  />
                </div>
              </div>
            )}

            {active === "video" && (
              <div className="space-y-3.5">
                <div className="flex gap-4 flex-wrap text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Quality preset</span>
                    <select className="input py-0.5 text-xs bg-bg-elevated/40" value={quality} onChange={(e) => setQuality(e.target.value)}>
                      {QUALITY_PRESETS.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Video encoder</span>
                    <select className="input py-0.5 text-xs bg-bg-elevated/40" value={encoder} onChange={(e) => setEncoder(e.target.value)}>
                      {ENCODERS.map((enc) => <option key={enc.id} value={enc.id}>{enc.label}</option>)}
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-txt font-semibold cursor-pointer">
                  <input type="checkbox" className="accent-accent" checked={burnSubs} onChange={(e) => setBurnSubs(e.target.checked)} />
                  Burn subtitles into video stream
                </label>
                {burnSubs && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="label">Font size</span>
                    <input type="number" min={12} max={72} className="input py-0.5 w-16" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value) || 28)} />
                  </div>
                )}
                <AudioOpts dubVolume={dubVolume} setDubVolume={setDubVolume} autoSync={autoSync} setAutoSync={setAutoSync} />
                <button
                  className="btn-primary py-1.5 px-4 text-xs font-semibold rounded shadow-md"
                  onClick={() => addToQueue("mp4")}
                  disabled={noVideo || noRows}
                >
                  🚀 Add Video to Export Queue
                </button>
              </div>
            )}

            {(active === "mp3" || active === "wav") && (
              <div className="space-y-3.5">
                <AudioOpts dubVolume={dubVolume} setDubVolume={setDubVolume} autoSync={autoSync} setAutoSync={setAutoSync} />
                <p className="text-[10px] text-txt-faint font-semibold">Global delay timing offset: {audioDelayMs}ms</p>
                <button
                  className="btn-primary py-1.5 px-4 text-xs font-semibold rounded shadow-md"
                  onClick={() => addToQueue(active === "mp3" ? "mp3" : "wav")}
                  disabled={noVideo || noRows}
                >
                  🚀 Add {active.toUpperCase()} to Export Queue
                </button>
              </div>
            )}

            {active === "subtitles" && (
              <div className="space-y-3">
                <p className="text-[11px] text-txt-faint font-semibold">Downloads the SRT file directly in the browser.</p>
                <button className="btn-primary py-1.5 px-4 font-semibold text-xs rounded" onClick={exportSrt} disabled={noRows}>
                  Download Subtitles (.srt)
                </button>
              </div>
            )}

            {active === "project" && (
              <div className="space-y-3.5">
                <p className="text-[10px] text-txt-faint font-semibold">Saves project mappings and references in the standard .aivd format.</p>
                <button
                  className="btn-primary py-1.5 px-4 font-semibold text-xs rounded"
                  onClick={() => addToQueue("aivd")}
                >
                  Add Project Save to Queue
                </button>
              </div>
            )}

            {/* active/queued list queue viewport */}
            {queue.length > 0 && (
              <div className="border-t border-border/40 pt-4 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-txt-faint uppercase">⚙️ Export Queue & Active Processing</span>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto bg-bg/10 rounded-lg p-2.5 border border-border/30">
                  {queue.map((item) => (
                    <div key={item.id} className="p-2 bg-bg-elevated/20 border border-border/20 rounded flex flex-col gap-1 text-[10px]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-txt truncate flex items-center gap-1.5">
                            {item.format === "mp4" ? "🎬" : "🎵"} {item.path.split(/[\\/]/).pop()}
                            <span className={`text-[8px] font-bold px-1.5 rounded uppercase ${
                              item.status === "done" ? "bg-success/20 text-success" : item.status === "error" ? "bg-danger/20 text-danger" : item.status === "running" ? "bg-accent/25 text-accent animate-pulse" : "bg-bg-elevated text-txt-faint"
                            }`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.status === "running" && (
                            <>
                              <Spinner size={10} className="text-accent" />
                              <button className="text-danger hover:underline font-semibold" onClick={() => cancelQueueItem(item.id)}>Cancel</button>
                            </>
                          )}
                          {item.status === "queued" && (
                            <button className="text-txt-faint hover:text-danger font-semibold" onClick={() => removeQueueItem(item.id)}>Remove</button>
                          )}
                          {item.status === "error" && (
                            <button className="text-accent hover:underline font-semibold" onClick={() => retryQueueItem(item)}>Retry</button>
                          )}
                        </div>
                      </div>
                      {(item.status === "running" || item.progress > 0) && (
                        <div className="space-y-1">
                          <div className="h-1 bg-bg-elevated rounded overflow-hidden">
                            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${item.progress}%` }} />
                          </div>
                          <div className="flex justify-between text-[9px] font-mono text-txt-faint">
                            <span>{item.message} ({item.progress}%)</span>
                            {item.eta && <span>ETA: {item.eta}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* export history viewport */}
            {history.length > 0 && (
              <div className="border-t border-border/40 pt-4 flex flex-col gap-2 mt-auto">
                <div className="flex items-center justify-between text-[10px] font-bold text-txt-faint uppercase">
                  <span>📜 Completed Export History</span>
                  <button className="text-danger hover:underline text-[9px]" onClick={clearHistory}>Clear History</button>
                </div>
                <div className="flex flex-col gap-1 max-h-36 overflow-y-auto divide-y divide-border/20 bg-bg/10 rounded-lg p-2.5">
                  {history.map((h) => (
                    <div key={h.id} className="py-2 flex items-center justify-between gap-3 text-[10px]">
                      <div className="min-w-0">
                        <div className="font-semibold text-txt truncate flex items-center gap-1.5">
                          {h.format === "mp4" ? "🎬" : "🎵"} {h.name}
                          <span className={`text-[8px] font-bold px-1.5 rounded ${
                            h.status === "done" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                          }`}>
                            {h.status}
                          </span>
                        </div>
                        <div className="text-[9px] text-txt-faint font-mono truncate">{h.path}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {h.status === "done" && (h.format === "mp3" || h.format === "wav" || h.format === "mp4") && (
                          <button
                            className="btn-ghost px-2 py-0.5 text-[9px] border border-border/50 rounded"
                            onClick={() => triggerDownload(h.path, h.format)}
                          >
                            Download
                          </button>
                        )}
                        <span className="text-txt-faint font-mono">{h.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end bg-bg/25">
          <button className="btn-ghost px-4 py-1.5 rounded border border-border/60 text-xs text-txt hover:bg-bg-hover" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function AudioOpts({
  dubVolume, setDubVolume, autoSync, setAutoSync,
}: {
  dubVolume: number; setDubVolume: (v: number) => void; autoSync: boolean; setAutoSync: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-2.5 bg-bg/15 border border-border/40 rounded-lg text-xs">
      <div className="flex items-center gap-3">
        <span className="label shrink-0">Dub volume ({dubVolume}%)</span>
        <input type="range" min={0} max={200} value={dubVolume} onChange={(e) => setDubVolume(parseInt(e.target.value))} className="flex-1 accent-accent" />
      </div>
      <label className="flex items-center gap-2 text-txt font-semibold cursor-pointer">
        <input type="checkbox" className="accent-accent" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
        Auto-sync speed to fit each row's timeline boundary
      </label>
    </div>
  );
}
