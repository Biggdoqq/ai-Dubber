import { useCallback, useEffect, useRef, useState, useMemo, lazy, Suspense } from "react";
import { api } from "./api/client";
import type { Subtitle, Voice } from "./api/types";
import { useJob } from "./hooks/useJob";
import { parseTime, fmtTime } from "./lib/format";
import { recordRecent, saveAutosave, type WorkspaceLayout, type AutosaveSnapshot } from "./lib/projectStore";
import TitleBar, { type Menu } from "./components/TitleBar";
import Sidebar, { type SidebarItem } from "./components/Sidebar";
import Panel from "./components/Panel";
import Splitter from "./components/Splitter";
import Icon from "./components/Icon";
import VideoPlayer from "./components/VideoPlayer";
import TimelinePanel from "./components/TimelinePanel";
import SubtitleTable from "./components/SubtitleTable";
import CharactersPanel from "./components/CharactersPanel";
import TranslationPanel from "./components/TranslationPanel";
import VoiceControlPanel from "./components/VoiceControlPanel";
import StatusBar from "./components/StatusBar";
import JobProgress from "./components/JobProgress";
import Spinner from "./components/Spinner";
import ToastContainer, { type ToastItem, type ToastType } from "./components/Toast";
import WelcomeScreen from "./components/WelcomeScreen";

const SettingsDialog = lazy(() => import("./components/SettingsDialog"));
const AIToolsDialog = lazy(() => import("./components/AIToolsDialog"));
const AIStudioDialog = lazy(() => import("./components/AIStudioDialog"));
const BatchManagerDialog = lazy(() => import("./components/BatchManagerDialog"));
const UtilitiesDialog = lazy(() => import("./components/UtilitiesDialog"));
const VoxCPMStudioDialog = lazy(() => import("./components/VoxCPMStudioDialog"));
const VoiceStudioDialog = lazy(() => import("./components/VoiceStudioDialog"));
const KhmerAudioTranslatorDialog = lazy(() => import("./components/KhmerAudioTranslatorDialog"));
const EffectsManagerDialog = lazy(() => import("./components/EffectsManagerDialog"));
const EffectsStudioDialog = lazy(() => import("./components/EffectsStudioDialog"));
const ProjectManagerDialog = lazy(() => import("./components/ProjectManagerDialog"));
const ExportCenterDialog = lazy(() => import("./components/ExportCenterDialog"));
const FindReplaceDialog = lazy(() => import("./components/FindReplaceDialog"));
const ShortcutsDialog = lazy(() => import("./components/ShortcutsDialog"));
const AboutDialog = lazy(() => import("./components/AboutDialog"));

let toastId = 0;

const blank = (over: Partial<Subtitle> = {}): Subtitle => ({
  start: 0,
  end: 0,
  text: "",
  pitch: 0,
  speed: 1,
  volume: 100,
  voice: "",
  echo: 0,
  ...over,
});

type WorkspaceTab = "subtitles" | "characters" | "effects" | "batch" | "utilities";

export default function App() {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);

  const [rows, setRows] = useState<Subtitle[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [voices, setVoices] = useState<Voice[]>([]);

  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("km");
  const [engine, setEngine] = useState("google");
  const [audioDelayMs] = useState(80);

  const [tab, setTab] = useState<WorkspaceTab>("subtitles");
  const [showSettings, setShowSettings] = useState(false);
  const [showAITools, setShowAITools] = useState(false);
  const [showAIStudio, setShowAIStudio] = useState(false);
  const [showBatchTools, setShowBatchTools] = useState(false);
  const [showUtilities, setShowUtilities] = useState(false);
  const [showVoxStudio, setShowVoxStudio] = useState(false);
  const [showVoiceStudio, setShowVoiceStudio] = useState(false);
  const [showEffectsManager, setShowEffectsManager] = useState(false);
  const [showEffectsStudio, setShowEffectsStudio] = useState(false);
  const [showKhTranslator, setShowKhTranslator] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showExportCenter, setShowExportCenter] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [whisperModel, setWhisperModel] = useState("base");
  const [showFindReplace, setShowFindReplace] = useState(false);  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // ---- layout state ----
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [videoWidth, setVideoWidth] = useState(440);
  const [timelineHeight, setTimelineHeight] = useState(220);
  const [showVideo, setShowVideo] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showRightDrawer, setShowRightDrawer] = useState(true);

  // ---- undo/redo history + clipboard ----
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const curTimeRef = useRef(currentTime);
  curTimeRef.current = currentTime;
  const historyRef = useRef<{ past: Subtitle[][]; future: Subtitle[][] }>({ past: [], future: [] });
  const clipboardRef = useRef<Subtitle[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const HISTORY_LIMIT = 50;
  const pushHistory = useCallback(() => {
    const h = historyRef.current;
    h.past.push(rowsRef.current);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const transcribeJob = useJob();
  const translateJob = useJob();
  const exportJob = useJob();
  const busy = transcribeJob.running || translateJob.running || exportJob.running;

  useEffect(() => {
    api.voices().then((v) => setVoices([...v.edge, ...v.voxcpm])).catch(() => {});
    api.getSettings().then((s) => setWhisperModel((s.whisper_model_size as string) || "base")).catch(() => {});
  }, []);

  // ---- autosave (every 60s) — snapshot to local storage for recovery ----
  const snapshotRef = useRef({ videoPath, videoName, videoDuration, rows });
  snapshotRef.current = { videoPath, videoName, videoDuration, rows };
  useEffect(() => {
    if (!autosaveEnabled) return;
    const id = window.setInterval(() => {
      const s = snapshotRef.current;
      if (s.rows.length === 0) return;
      saveAutosave({
        video: s.videoPath,
        videoName: s.videoName,
        videoDuration: s.videoDuration,
        rows: s.rows,
        savedAt: Date.now(),
      });
    }, 60000);
    return () => window.clearInterval(id);
  }, [autosaveEnabled]);

  const layout: WorkspaceLayout = {
    sidebarCollapsed,
    videoWidth,
    timelineHeight,
    showVideo,
    showTimeline,
  };
  const applyLayout = (l: WorkspaceLayout) => {
    setSidebarCollapsed(l.sidebarCollapsed);
    setVideoWidth(l.videoWidth);
    setTimelineHeight(l.timelineHeight);
    setShowVideo(l.showVideo);
    setShowTimeline(l.showTimeline);
  };
  const recoverSnapshot = (snap: AutosaveSnapshot) => {
    setRows(snap.rows.map((r) => blank(r)));
    setVideoPath(snap.video);
    setVideoName(snap.videoName);
    setVideoDuration(snap.videoDuration);
    setSelected(new Set());
    notify(`Recovered ${snap.rows.length} rows from autosave`, "success");
  };

  const notify = (msg: string, type: ToastType = "info") => {
    setToasts((prev) => [...prev, { id: toastId++, message: msg, type }]);
  };
  const dismissToast = useCallback(
    (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  // ---- video ----
  const loadVideo = async (file: File) => {
    try {
      const res = await api.uploadMedia(file);
      setVideoPath(res.path);
      setVideoName(res.name);
      setVideoDuration(res.duration);
      notify(`Loaded ${res.name}`);
    } catch (e) {
      notify(`Load failed: ${e}`);
    }
  };

  // ---- project ----
  const newProject = () => {
    if (rows.length && !confirm("Discard the current subtitles and start a new project?")) return;
    setRows([]);
    setSelected(new Set());
    setVideoPath(null);
    setVideoName(null);
    setVideoDuration(0);
    notify("New project");
  };

  const openProjectPath = async (path: string) => {
    try {
      const proj = await api.openProject(path);
      setRows(proj.subtitles.map((r) => blank(r)));
      if (proj.video) {
        setVideoPath(proj.video);
        setVideoName(proj.video.split(/[\\/]/).pop() || proj.video);
      }
      const name = path.split(/[\\/]/).pop() || path;
      recordRecent(path, name, proj.subtitles.length);
      notify(`Opened ${proj.subtitles.length} subtitles`);
    } catch (e) {
      notify(`Open failed: ${e}`, "error");
    }
  };

  const openProject = async () => {
    const path = prompt("Open project — enter the full path to a .aivd file:");
    if (!path) return;
    await openProjectPath(path);
  };

  const saveProject = async () => {
    const path = prompt("Save project — enter the full path for the .aivd file:");
    if (!path) return;
    try {
      await api.saveProject(videoPath || "", rows, path);
      const name = path.split(/[\\/]/).pop() || path;
      recordRecent(path, name, rows.length);
      notify(`Saved to ${path}`, "success");
    } catch (e) {
      notify(`Save failed: ${e}`, "error");
    }
  };

  // ---- srt ----
  const importSrt = async (content: string) => {
    const { rows: parsed } = await api.parseSrt(content);
    setRows(parsed.map((r) => blank(r)));
    notify(`Imported ${parsed.length} subtitles`, "success");
  };

  // ---- drag & drop ----
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".srt") || name.endsWith(".txt")) {
        importSrt(await file.text());
      } else if (file.type.startsWith("video/") || /\.(mp4|mkv|avi|mov|webm|m4v|flv)$/.test(name)) {
        loadVideo(file);
      } else {
        notify(`Unsupported file: ${file.name}`, "warning");
      }
    }
  };

  const exportSrt = async () => {
    const srt = await api.buildSrt(rows);
    const blobUrl = URL.createObjectURL(new Blob([srt], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "subtitles.srt";
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  // ---- editing ----
  const editRow = useCallback((index: number, patch: Partial<Subtitle>) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      if (patch.start_str) next[index].start = parseTime(patch.start_str);
      if (patch.end_str) next[index].end = parseTime(patch.end_str);
      return next;
    });
  }, []);

  const editMultiple = useCallback(
    (indices: number[], patch: Partial<Subtitle>) => {
      if (indices.length === 0) return;
      pushHistory();
      setRows((prev) => {
        const next = [...prev];
        for (const idx of indices) {
          if (idx >= 0 && idx < next.length) {
            next[idx] = { ...next[idx], ...patch };
          }
        }
        return next;
      });
    },
    [pushHistory]
  );

  const editTimings = useCallback(
    (edits: { index: number; start: number; end: number }[]) => {
      pushHistory();
      setRows((prev) => {
        const next = [...prev];
        for (const { index, start, end } of edits) {
          if (index < 0 || index >= next.length) continue;
          const s = Math.max(0, start);
          const e = Math.max(s + 0.05, end);
          next[index] = {
            ...next[index],
            start: s,
            end: e,
            start_str: fmtTime(s),
            end_str: fmtTime(e),
          };
        }
        return next;
      });
    },
    [pushHistory]
  );

  const applyVoiceControls = useCallback(
    (patch: Partial<Subtitle>, target: "selected" | "all") => {
      if (Object.keys(patch).length === 0) return notify("No fields enabled to apply");
      const apply = target === "all" ? null : selected;
      if (target === "selected" && (!apply || apply.size === 0))
        return notify("No rows selected");
      pushHistory();
      setRows((prev) =>
        prev.map((r, i) => (apply === null || apply.has(i) ? { ...r, ...patch } : r))
      );
      const n = target === "all" ? rows.length : selected.size;
      notify(`Applied voice controls to ${n} row(s)`);
    },
    [selected, rows.length, pushHistory]
  );

  const selectRow = useCallback((index: number, additive: boolean) => {
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<number>();
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }, []);

  const deleteSelected = () => {
    if (selected.size === 0) return notify("No rows selected");
    pushHistory();
    setRows((prev) => prev.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
    notify(`Deleted ${selected.size} row(s)`);
  };

  // ---- undo / redo ----
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return notify("Nothing to undo");
    h.future.push(rowsRef.current);
    const prev = h.past.pop()!;
    setRows(prev);
    setSelected(new Set());
    setCanUndo(h.past.length > 0);
    setCanRedo(true);
    notify("Undo");
  }, []);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return notify("Nothing to redo");
    h.past.push(rowsRef.current);
    const next = h.future.pop()!;
    setRows(next);
    setSelected(new Set());
    setCanUndo(true);
    setCanRedo(h.future.length > 0);
    notify("Redo");
  }, []);

  // ---- split a subtitle at the playhead (or its midpoint) ----
  const splitAtPlayhead = useCallback(() => {
    const cur = rowsRef.current;
    const t = curTimeRef.current;
    // Prefer the row under the playhead; else the single selected row.
    let idx = cur.findIndex((r) => t > r.start && t < r.end);
    if (idx < 0 && selected.size === 1) idx = [...selected][0];
    if (idx < 0) return notify("Move the playhead inside a subtitle to split");
    const row = cur[idx];
    const splitT = t > row.start && t < row.end ? t : (row.start + row.end) / 2;
    if (splitT - row.start < 0.05 || row.end - splitT < 0.05)
      return notify("Split point too close to an edge");
    pushHistory();
    const words = row.text.split(/\s+/).filter(Boolean);
    const ratio = (splitT - row.start) / (row.end - row.start);
    const cut = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
    const first = blank({ ...row, end: splitT, end_str: fmtTime(splitT), text: words.slice(0, cut).join(" ") });
    const second = blank({ ...row, start: splitT, start_str: fmtTime(splitT), text: words.slice(cut).join(" ") });
    setRows((prev) => [...prev.slice(0, idx), first, second, ...prev.slice(idx + 1)]);
    setSelected(new Set([idx, idx + 1]));
    notify("Split subtitle");
  }, [selected, pushHistory]);

  // ---- copy / paste ----
  const copySelected = useCallback(() => {
    if (selected.size === 0) return notify("No rows selected to copy");
    const picked = [...selected].sort((a, b) => a - b).map((i) => rowsRef.current[i]);
    clipboardRef.current = picked.map((r) => ({ ...r }));
    notify(`Copied ${picked.length} row(s)`);
  }, [selected]);

  const paste = useCallback(() => {
    const clip = clipboardRef.current;
    if (clip.length === 0) return notify("Clipboard is empty");
    // Offset the pasted block so it begins at the playhead.
    const base = clip[0].start;
    const t = curTimeRef.current;
    const offset = t - base;
    pushHistory();
    const pasted = clip.map((r) => {
      const s = Math.max(0, r.start + offset);
      const e = Math.max(s + 0.05, r.end + offset);
      return blank({ ...r, start: s, end: e, start_str: fmtTime(s), end_str: fmtTime(e) });
    });
    setRows((prev) => {
      const next = [...prev, ...pasted].sort((a, b) => a.start - b.start);
      return next;
    });
    notify(`Pasted ${pasted.length} row(s)`);
  }, [pushHistory]);

  const duplicateSelected = useCallback(() => {
    if (selected.size === 0) return notify("No rows selected to duplicate");
    const picked = [...selected].sort((a, b) => a - b).map((i) => rowsRef.current[i]);
    pushHistory();
    const duplicated = picked.map((r) => {
      const duration = r.end - r.start;
      const s = r.end + 0.1; // place 0.1s after the original end
      const e = s + duration;
      return blank({ ...r, start: s, end: e, start_str: fmtTime(s), end_str: fmtTime(e) });
    });
    setRows((prev) => {
      const next = [...prev, ...duplicated].sort((a, b) => a.start - b.start);
      return next;
    });
    notify(`Duplicated ${picked.length} row(s)`);
  }, [selected, pushHistory]);

  const findReplaceAll = (find: string, replace: string, matchCase: boolean): number => {
    const flags = matchCase ? "g" : "gi";
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, flags);
    
    // Pre-check match count
    let totalMatches = 0;
    for (const r of rows) {
      const m = r.text.match(re);
      if (m) totalMatches += m.length;
    }
    
    if (totalMatches === 0) return 0;
    
    pushHistory();
    setRows((prev) =>
      prev.map((r) => {
        const matches = r.text.match(re);
        if (matches) {
          return { ...r, text: r.text.replace(re, replace) };
        }
        return r;
      })
    );
    return totalMatches;
  };

  // ---- tools ----
  const autoSpeed = async () => {
    const { subtitles } = await api.autoSpeed(rows, targetLang === "en" ? "en" : "km");
    setRows(subtitles.map((r) => blank(r)));
    notify("Auto-speed applied");
  };

  const merge = async () => {
    const indices = [...selected].sort((a, b) => a - b);
    if (indices.length < 2) return notify("Select 2+ consecutive rows to merge");
    try {
      const { subtitles } = await api.mergeRows(rows, indices);
      pushHistory();
      setRows(subtitles.map((r) => blank(r)));
      setSelected(new Set());
      notify("Merged rows");
    } catch (e) {
      notify(`${e}`);
    }
  };

  const shift = async (offset: number) => {
    const indices = selected.size ? [...selected] : rows.map((_, i) => i);
    if (indices.length === 0) return notify("No subtitles to shift");
    try {
      const { subtitles } = await api.shiftTimes(rows, indices, offset);
      setRows(subtitles.map((r) => blank(r)));
      notify(`Shifted ${offset > 0 ? "+" : ""}${offset}s`);
    } catch (e) {
      notify(`${e}`);
    }
  };

  const autoSplit = async () => {
    if (rows.length === 0) return notify("No subtitles to split");
    try {
      const { subtitles } = await api.autoSplit(rows);
      setRows(subtitles.map((r) => blank(r)));
      setSelected(new Set());
      notify("Split long rows");
    } catch (e) {
      notify(`${e}`);
    }
  };

  const spellCheck = async () => {
    if (rows.length === 0) return notify("No subtitles to check");
    const payload = rows.map((r, i) => ({ row_index: i, text: r.text }));
    const final = await translateJob.start(() => api.spellCheck(payload));
    if (final.status === "done") {
      pushHistory();
      const result = final.result as Record<string, { text: string }>;
      setRows((prev) =>
        prev.map((r, i) => {
          const t = result[i] ?? result[String(i)];
          return t ? { ...r, text: t.text } : r;
        })
      );
      notify("Spell check complete");
    } else {
      notify("Spell check failed");
    }
  };

  const autoGender = async () => {
    if (!videoPath) return notify("Load a video first");
    if (rows.length === 0) return notify("No subtitles");
    const payload = rows.map((r) => ({ start: r.start, end: r.end }));
    const final = await translateJob.start(() => api.analyzeGender(videoPath, payload));
    if (final.status === "done") {
      pushHistory();
      const result = final.result as { genders: string[] };
      setRows((prev) =>
        prev.map((r, i) => {
          const g = result.genders[i];
          return g && g !== "Unknown" ? { ...r, gender: g } : r;
        })
      );
      notify("Auto gender applied");
    } else {
      notify("Auto gender failed");
    }
  };

  const autoVoice = async () => {
    if (rows.length === 0) return notify("No subtitles");
    try {
      const { subtitles } = await api.autoVoice(rows);
      pushHistory();
      setRows(subtitles.map((r) => blank(r)));
      notify("Auto voice assignment applied");
    } catch (e) {
      notify(`Auto voice failed: ${e}`);
    }
  };

  const smartCleanup = async () => {
    if (rows.length === 0) return notify("No subtitles to clean");
    try {
      const { subtitles } = await api.cleanupSubtitles(rows);
      pushHistory();
      setRows(subtitles.map((r) => blank(r)));
      setSelected(new Set());
      notify(`Cleaned up subtitles (${rows.length} → ${subtitles.length} rows)`);
    } catch (e) {
      notify(`Cleanup failed: ${e}`);
    }
  };

  const detectCharacters = async () => {
    if (rows.length === 0) return notify("No subtitles");
    try {
      const r = await api.detectCharacters(rows);
      if (r.characters.length === 0) {
        notify("No speaker labels detected (expects 'NAME:' prefixes)");
      } else {
        const top = r.characters.slice(0, 5).map((c) => `${c} (${r.counts[c]})`).join(", ");
        notify(`Detected ${r.characters.length} character(s): ${top}`);
      }
    } catch (e) {
      notify(`Character detection failed: ${e}`);
    }
  };

  const transcribe = async () => {
    if (!videoPath) return notify("Load a video first");
    const settings = await api.getSettings();
    const final = await transcribeJob.start(() =>
      api.transcribe(videoPath, (settings.whisper_model_size as string) || "base", false, "faster-whisper")
    );
    if (final.status === "done") {
      const result = final.result as { segments: Subtitle[] };
      setRows(result.segments.map((s) => blank(s)));
      notify(`Transcribed ${result.segments.length} segments`);
    } else if (final.status === "error") {
      notify(`Transcription failed`);
    }
  };

  const translate = async () => {
    if (rows.length === 0) return notify("No subtitles to translate");
    const payload = rows.map((r, i) => ({
      row_index: i,
      text: r.text,
      duration: Math.max(0.5, r.end - r.start),
    }));
    const final = await translateJob.start(() =>
      api.translate(payload, sourceLang, targetLang, engine)
    );
    if (final.status === "done") {
      const result = final.result as Record<string, { text: string; gender?: string; emotion?: string }>;
      setRows((prev) =>
        prev.map((r, i) => {
          const t = result[i] ?? result[String(i)];
          return t ? { ...r, text: t.text, gender: t.gender, emotion: t.emotion } : r;
        })
      );
      notify("Translation complete");
    } else {
      notify("Translation failed");
    }
  };

  const previewRow = async (index: number) => {
    const r = rows[index];
    try {
      const res = await fetch(api.ttsPreviewUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: r.text, voice: r.voice, speed: r.speed }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      new Audio(url).play();
    } catch (e) {
      notify(`Preview failed: ${e}`);
    }
  };

  const exportMp3 = async () => {
    if (rows.length === 0) return notify("No subtitles");
    if (videoDuration <= 0) return notify("Load a video first");
    const out = `${videoPath?.replace(/\.[^.]+$/, "") || "output"}_dub.mp3`;
    const final = await exportJob.start(() =>
      api.exportAudio(rows, videoDuration, out, { dub_volume: 100, auto_sync_speed: true, audio_start_offset_ms: audioDelayMs })
    );
    if (final.status === "done") {
      const downloadUrl = `/api/media/stream?path=${encodeURIComponent(out)}`;
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = out.split(/[\\/]/).pop() || "dub.mp3";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notify(`Exported and downloaded: ${out}`, "success");
    } else {
      notify("Export failed", "error");
    }
  };

  const removeVocalQuick = async () => {
    if (!videoPath) return notify("Load a video first");
    const out = `${videoPath.replace(/\.[^.]+$/, "")}_novocals.mp4`;
    const final = await exportJob.start(() => api.removeVocals(videoPath, out, false));
    notify(final.status === "done" ? `Vocals removed → ${out}` : "Vocal removal failed");
  };

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (mod && e.key === "n") { e.preventDefault(); newProject(); }
      else if (mod && e.key === "o") { e.preventDefault(); openProject(); }
      else if (mod && e.key === "s") { e.preventDefault(); saveProject(); }
      else if (mod && e.key === "f") { e.preventDefault(); setShowFindReplace(true); }
      else if (mod && e.key === "t") { e.preventDefault(); transcribe(); }
      else if (mod && e.key === "e") { e.preventDefault(); exportMp3(); }
      else if (mod && e.key.toLowerCase() === "c" && !typing && selected.size) { e.preventDefault(); copySelected(); }
      else if (mod && e.key.toLowerCase() === "v" && !typing) { e.preventDefault(); paste(); }
      else if (e.key === "Delete" && !typing) { e.preventDefault(); deleteSelected(); }
      else if (e.key === "Escape") {
        setShowSettings(false);
        setShowFindReplace(false);
        setShowShortcuts(false);
        setShowAbout(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Memoized so the O(n) scan only runs when rows or currentTime changes (not on every render)
  const activeRow = useMemo(
    () => rows.findIndex((r) => currentTime >= r.start && currentTime <= r.end),
    [rows, currentTime]
  );

  const menus: Menu[] = [
    {
      label: "File",
      items: [
        { label: "New Project", shortcut: "Ctrl+N", onClick: newProject },
        { label: "Open Project…", shortcut: "Ctrl+O", onClick: openProject },
        { label: "Save Project…", shortcut: "Ctrl+S", onClick: saveProject },
        { label: "Project Manager…", onClick: () => setShowProjectManager(true) },
        { separator: true, label: "" },
        { label: "Import SRT", onClick: () => document.getElementById("toolbar-srt-input")?.click() },
        { label: "Export SRT", onClick: exportSrt, disabled: rows.length === 0 },
        { label: "Export Center…", onClick: () => setShowExportCenter(true) },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Find & Replace…", shortcut: "Ctrl+F", onClick: () => setShowFindReplace(true) },
        { label: "Delete Selected Row(s)", shortcut: "Delete", onClick: deleteSelected, disabled: selected.size === 0 },
        { separator: true, label: "" },
        { label: "Merge Selected Rows", onClick: merge, disabled: selected.size < 2 },
        { label: "Auto-Split Long Rows", onClick: autoSplit, disabled: rows.length === 0 },
        { label: "Shift −0.2s", onClick: () => shift(-0.2), disabled: rows.length === 0 },
        { label: "Shift +0.2s", onClick: () => shift(0.2), disabled: rows.length === 0 },
      ],
    },
    {
      label: "Tools",
      items: [
        { label: "AI Studio (Spell / Gender / Voice / Translate / Suggestions)…", onClick: () => setShowAIStudio(true) },
        { label: "AI Tools (Transcribe / Silence / Audio / Batch)…", onClick: () => setShowAITools(true) },
        { label: "Batch Manager (Videos / Translate / Export / MP3)…", onClick: () => setTab("batch") },
        { label: "Transcribe Video", shortcut: "Ctrl+T", onClick: transcribe, disabled: busy },
        { label: "Auto-Speed", onClick: autoSpeed, disabled: rows.length === 0 },
        { label: "Translate", onClick: translate, disabled: rows.length === 0 },
        { label: "Remove Vocal", onClick: removeVocalQuick, disabled: busy },
        { label: "Effects Studio (Vocal / Noise / Enhance / FX / Background)…", onClick: () => setTab("effects") },
        { label: "Effects Manager…", onClick: () => setShowEffectsManager(true) },
        { separator: true, label: "" },
        { label: "Character Manager", onClick: () => setTab("characters") },
        { label: "Voice Studio…", onClick: () => setShowVoiceStudio(true) },
        { label: "VoxCPM Voice Studio…", onClick: () => setShowVoxStudio(true) },
        { label: "Utilities…", onClick: () => setTab("utilities") },
        { label: "Settings…", onClick: () => setShowSettings(true) },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Keyboard Shortcuts", onClick: () => setShowShortcuts(true) },
        { label: "About", onClick: () => setShowAbout(true) },
      ],
    },
  ];

  const sidebarItems: SidebarItem[] = [
    {
      id: "subtitles",
      label: "Subtitles",
      icon: <Icon name="srt" size={18} />,
      onClick: () => setTab("subtitles"),
      active: tab === "subtitles",
    },
    {
      id: "characters",
      label: "Characters",
      icon: <Icon name="users" size={18} />,
      onClick: () => setTab("characters"),
      active: tab === "characters",
    },
    {
      id: "effects",
      label: "Effects Studio",
      icon: <Icon name="tools" size={18} />,
      onClick: () => setTab("effects"),
      active: tab === "effects",
    },
    {
      id: "batch",
      label: "Batch Manager",
      icon: <Icon name="batch" size={18} />,
      onClick: () => setTab("batch"),
      active: tab === "batch",
    },
    {
      id: "utilities",
      label: "Utilities Center",
      icon: <Icon name="wrench" size={18} />,
      onClick: () => setTab("utilities"),
      active: tab === "utilities",
    },
  ];

  const sidebarFooter: SidebarItem[] = [
    {
      id: "video",
      label: showVideo ? "Hide Video" : "Show Video",
      icon: <Icon name="video" size={18} />,
      onClick: () => setShowVideo((v) => !v),
      active: showVideo,
    },
    {
      id: "timeline",
      label: showTimeline ? "Hide Timeline" : "Show Timeline",
      icon: <Icon name="clock" size={18} />,
      onClick: () => setShowTimeline((v) => !v),
      active: showTimeline,
    },
    {
      id: "settings",
      label: "Settings",
      icon: <Icon name="settings" size={18} />,
      onClick: () => setShowSettings(true),
    },
  ];

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      <TitleBar
        menus={menus}
        onLoadVideo={loadVideo}
        onImportSrt={importSrt}
        onExportSrt={exportSrt}
        onExportMp3={exportMp3}
        onOpenExportCenter={() => setShowExportCenter(true)}
        busy={busy}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          items={sidebarItems}
          footerItems={sidebarFooter}
        />

        <div className="flex-1 flex flex-col min-h-0">
          {/* Hide video panel when welcome screen is active */}
          <div className="flex-1 flex min-h-0 p-2 gap-2 overflow-hidden">
            {showVideo && rows.length > 0 || showVideo && videoPath ? (
              <>
                <div
                  className="shrink-0 flex flex-col min-h-0"
                  style={{ width: videoWidth }}
                >
                  <Panel
                    title="Video Preview"
                    icon={<Icon name="video" size={14} />}
                    onClose={() => setShowVideo(false)}
                    className="flex-1"
                    bodyClassName="flex flex-col overflow-hidden"
                  >
                    <VideoPlayer
                      videoPath={videoPath}
                      currentTime={currentTime}
                      onTimeUpdate={setCurrentTime}
                      onDuration={setVideoDuration}
                      seekTo={seekTo}
                    />
                  </Panel>
                </div>
                <Splitter
                  orientation="vertical"
                  onResize={(d) =>
                    setVideoWidth((w) => Math.max(300, Math.min(760, w + d)))
                  }
                />
              </>
            ) : null}

            <div className="flex-1 flex min-h-0 gap-3 pl-0 overflow-hidden">
              <Suspense fallback={
                <div className="flex-1 flex items-center justify-center bg-[#0d0f17]/40 backdrop-blur-md border border-white/5 rounded-2xl">
                  <Spinner size={24} className="text-accent" />
                </div>
              }>
                {tab === "subtitles" && (
                  <>
                    {/* Welcome Screen when nothing loaded */}
                    {rows.length === 0 && !videoPath ? (
                      <WelcomeScreen
                        onLoadVideo={() => document.getElementById("toolbar-video-input")?.click()}
                        onImportSrt={() => document.getElementById("toolbar-srt-input")?.click()}
                        onOpenProject={() => setShowProjectManager(true)}
                      />
                    ) : (
                      /* Subtitle Editor — full width */
                      <div className="flex-1 flex min-h-0 relative overflow-hidden">
                        <SubtitleTable
                          rows={rows}
                          voices={voices}
                          selected={selected}
                          activeRow={activeRow >= 0 ? activeRow : null}
                          onSelect={selectRow}
                          onEdit={editRow}
                          onEditMultiple={editMultiple}
                          onSeek={(t) => setSeekTo(t)}
                          onPreview={previewRow}
                          onSetSelected={setSelected}
                          onDelete={deleteSelected}
                          onCopy={copySelected}
                          onPaste={paste}
                          onDuplicate={duplicateSelected}
                          onTranscribe={transcribe}
                          onAutoSpeed={autoSpeed}
                          onMerge={merge}
                          busy={busy}
                          onToggleDrawer={() => setShowRightDrawer(d => !d)}
                          drawerOpen={showRightDrawer}
                        />

                        {/* ── Right Drawer: Translation + Voice ── */}
                        <div
                          className={`shrink-0 flex flex-col gap-3 min-h-0 overflow-y-auto transition-all duration-300 ease-in-out ${
                            showRightDrawer
                              ? "w-[300px] opacity-100 ml-2"
                              : "w-0 opacity-0 overflow-hidden ml-0"
                          }`}
                        >
                          {showRightDrawer && (
                            <>
                              <TranslationPanel
                                sourceLang={sourceLang}
                                targetLang={targetLang}
                                engine={engine}
                                onSourceChange={setSourceLang}
                                onTargetChange={setTargetLang}
                                onEngineChange={setEngine}
                                onTranslate={translate}
                                onSpellCheck={spellCheck}
                                onAutoGender={autoGender}
                                busy={busy}
                                translateJob={translateJob}
                                rows={rows}
                              />
                              <VoiceControlPanel
                                voices={voices}
                                rows={rows}
                                selected={selected}
                                onApply={applyVoiceControls}
                                busy={busy}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {tab === "characters" && (
                  <Panel
                    title="Character Manager"
                    icon={<Icon name="users" size={14} />}
                    className="flex-1"
                  >
                    <CharactersPanel voices={voices} rows={rows} notify={notify} />
                  </Panel>
                )}
                {tab === "effects" && (
                  <Panel
                    title="Effects Studio"
                    icon={<Icon name="tools" size={14} />}
                    className="flex-1"
                  >
                    <EffectsStudioDialog
                      videoPath={videoPath}
                      notify={notify}
                      inline
                    />
                  </Panel>
                )}
                {tab === "batch" && (
                  <Panel
                    title="Batch Manager"
                    icon={<Icon name="batch" size={14} />}
                    className="flex-1"
                  >
                    <BatchManagerDialog
                      notify={notify}
                      inline
                    />
                  </Panel>
                )}
                {tab === "utilities" && (
                  <Panel
                    title="Diagnostics & Logs"
                    icon={<Icon name="wrench" size={14} />}
                    className="flex-1"
                  >
                    <UtilitiesDialog
                      notify={notify}
                      inline
                    />
                  </Panel>
                )}
              </Suspense>
            </div>
          </div>

          {showTimeline && (rows.length > 0 || videoPath) && (
            <>
              <Splitter
                orientation="horizontal"
                onResize={(d) =>
                  setTimelineHeight((h) => Math.max(140, Math.min(460, h - d)))
                }
              />
              <div
                className="shrink-0 px-2 pb-2 flex flex-col min-h-0"
                style={{ height: timelineHeight }}
              >
                <TimelinePanel
                  videoPath={videoPath}
                  duration={videoDuration}
                  currentTime={currentTime}
                  rows={rows}
                  activeRow={activeRow >= 0 ? activeRow : null}
                  selected={selected}
                  onSeek={(t) => setSeekTo(t)}
                  onSetSelected={setSelected}
                  onEditTimings={editTimings}
                  onDelete={deleteSelected}
                  onMerge={merge}
                  onSplit={splitAtPlayhead}
                  onCopy={copySelected}
                  onPaste={paste}
                  onUndo={undo}
                  onRedo={redo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <StatusBar rows={rows} videoDuration={videoDuration} videoName={videoName} busy={busy} />

      <Suspense fallback={null}>
        {showSettings && (
          <SettingsDialog
            onClose={() => setShowSettings(false)}
            onSaved={() =>
              api
                .getSettings()
                .then((s) => setWhisperModel((s.whisper_model_size as string) || "base"))
                .catch(() => {})
            }
          />
        )}
        {showAIStudio && (
          <AIStudioDialog
            rows={rows}
            selected={selected}
            sourceLang={sourceLang}
            targetLang={targetLang}
            engine={engine}
            onSourceChange={setSourceLang}
            onTargetChange={setTargetLang}
            onEngineChange={setEngine}
            onTranslate={translate}
            onSpellCheck={spellCheck}
            onAutoGender={autoGender}
            onAutoVoice={autoVoice}
            onSmartCleanup={smartCleanup}
            busy={busy}
            onClose={() => setShowAIStudio(false)}
            notify={notify}
          />
        )}
        {showAITools && (
          <AIToolsDialog
            videoPath={videoPath}
            videoDuration={videoDuration}
            rows={rows}
            whisperModel={whisperModel}
            onClose={() => setShowAITools(false)}
            onSegments={(segs, label) => {
              setRows(segs);
              setSelected(new Set());
              notify(label);
            }}
            onSpellCheck={spellCheck}
            onAutoGender={autoGender}
            onAutoVoice={autoVoice}
            onSmartCleanup={smartCleanup}
            onMerge={merge}
            onAutoSplit={autoSplit}
            onDetectCharacters={detectCharacters}
            notify={notify}
          />
        )}
        {showBatchTools && (
          <BatchManagerDialog onClose={() => setShowBatchTools(false)} notify={notify} />
        )}
        {showUtilities && (
          <UtilitiesDialog onClose={() => setShowUtilities(false)} notify={notify} />
        )}
        {showVoxStudio && (
          <VoxCPMStudioDialog onClose={() => setShowVoxStudio(false)} notify={notify} />
        )}
        {showVoiceStudio && (
          <VoiceStudioDialog
            voices={voices}
            rows={rows}
            selected={selected}
            videoPath={videoPath}
            onApply={applyVoiceControls}
            onClose={() => setShowVoiceStudio(false)}
            notify={notify}
          />
        )}
        {showEffectsManager && (
          <EffectsManagerDialog
            videoPath={videoPath}
            onClose={() => setShowEffectsManager(false)}
            notify={notify}
          />
        )}
        {showEffectsStudio && (
          <EffectsStudioDialog
            videoPath={videoPath}
            onClose={() => setShowEffectsStudio(false)}
            notify={notify}
          />
        )}
        {showKhTranslator && (
          <KhmerAudioTranslatorDialog onClose={() => setShowKhTranslator(false)} notify={notify} />
        )}
        {showProjectManager && (
          <ProjectManagerDialog
            currentPath={null}
            currentName={videoName}
            rows={rows}
            videoDuration={videoDuration}
            autosaveEnabled={autosaveEnabled}
            layout={layout}
            onToggleAutosave={setAutosaveEnabled}
            onOpenPath={openProjectPath}
            onApplyLayout={applyLayout}
            onRecover={recoverSnapshot}
            onClose={() => setShowProjectManager(false)}
            notify={notify}
          />
        )}
        {showExportCenter && (
          <ExportCenterDialog
            rows={rows}
            videoPath={videoPath}
            videoName={videoName}
            videoDuration={videoDuration}
            audioDelayMs={audioDelayMs}
            onClose={() => setShowExportCenter(false)}
            notify={notify}
          />
        )}
        {showFindReplace && (
          <FindReplaceDialog onClose={() => setShowFindReplace(false)} onReplaceAll={findReplaceAll} />
        )}
        {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
        {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      </Suspense>

      {transcribeJob.running && (
        <JobProgress job={transcribeJob.job} title="Transcribing…" onCancel={transcribeJob.cancel} />
      )}
      {translateJob.running && (
        <JobProgress job={translateJob.job} title="Translating…" onCancel={translateJob.cancel} />
      )}
      {exportJob.running && (
        <JobProgress
          job={exportJob.job}
          title={exportJob.job?.kind === "export_video" ? "Exporting Video…" : "Exporting MP3…"}
          onCancel={exportJob.cancel}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {dragActive && (
        <div className="fixed inset-0 z-[300] bg-bg/80 backdrop-blur-sm flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="panel shadow-panel border-2 border-dashed border-accent px-10 py-8 text-center animate-scale-in">
            <div className="text-4xl mb-2">📥</div>
            <div className="text-base font-semibold text-txt">Drop to import</div>
            <div className="text-xs text-txt-muted mt-1">Video files load into the player · .srt files import as subtitles</div>
          </div>
        </div>
      )}
    </div>
  );
}
