import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";
import type { Subtitle } from "../api/types";
import { fmtClock } from "../lib/format";

interface Props {
  onClose: () => void;
  notify: (msg: string) => void;
}

const blankRow = (over: Partial<Subtitle>): Subtitle => ({
  start: 0, end: 0, text: "", pitch: 0, speed: 1, volume: 100, voice: "km-KH-SreymomNeural", echo: 0, ...over,
});

const SOURCE_LANGS: [string, string][] = [
  ["auto", "Auto-Detect"], ["en", "English"], ["th", "Thai"], ["vi", "Vietnamese"],
  ["zh-CN", "Chinese"], ["ja", "Japanese"], ["ko", "Korean"], ["fr", "French"],
];

export default function KhmerAudioTranslatorDialog({ onClose, notify }: Props) {
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [rows, setRows] = useState<Subtitle[]>([]);
  const [sourceLang, setSourceLang] = useState("auto");
  const [engine, setEngine] = useState("google");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const previewAudio = useRef<HTMLAudioElement | null>(null);

  const transcribeJob = useJob();
  const translateJob = useJob();
  const exportJob = useJob();
  const busy = uploading || transcribeJob.running || translateJob.running || exportJob.running;

  useEffect(() => {
    return () => {
      if (previewAudio.current) previewAudio.current.pause();
    };
  }, []);

  const importAudio = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.uploadMedia(file);
      setAudioPath(res.path);
      setAudioName(res.name);
      setAudioDuration(res.duration);
      setRows([]);
      notify(`Imported ${res.name}`);
    } catch (e) {
      notify(`Import failed: ${String(e).split("\n")[0]}`);
    } finally {
      setUploading(false);
    }
  };

  const translate = async () => {
    if (!audioPath) return notify("Import an audio file first");
    // 1) Transcribe the source audio into timed segments.
    const settings = await api.getSettings().catch(() => ({}) as Record<string, unknown>);
    const model = (settings.whisper_model_size as string) || "base";
    const tFinal = await transcribeJob.start(() =>
      api.transcribe(audioPath, model, false, "faster-whisper")
    );
    if (tFinal.status !== "done") {
      return notify(`Transcription failed: ${tFinal.error?.split("\n")[0] || ""}`);
    }
    const segments = (tFinal.result as { segments: Subtitle[] }).segments.map((s) => blankRow(s));
    if (segments.length === 0) return notify("No speech detected in the audio");
    setRows(segments);

    // 2) Translate every segment into Khmer.
    const payload = segments.map((r, i) => ({
      row_index: i,
      text: r.text,
      duration: Math.max(0.5, r.end - r.start),
    }));
    const trFinal = await translateJob.start(() =>
      api.translate(payload, sourceLang, "km", engine)
    );
    if (trFinal.status !== "done") {
      return notify(`Translation failed: ${trFinal.error?.split("\n")[0] || ""}`);
    }
    const result = trFinal.result as Record<string, { text: string; gender?: string; emotion?: string }>;
    setRows((prev) =>
      prev.map((r, i) => {
        const t = result[i] ?? result[String(i)];
        return t ? { ...r, text: t.text, gender: t.gender ?? r.gender, emotion: t.emotion ?? r.emotion } : r;
      })
    );
    notify(`Translated ${segments.length} segment(s) to Khmer`);
  };

  const editRow = (index: number, text: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, text } : r)));
  };

  const preview = async (index: number) => {
    const r = rows[index];
    if (!r?.text.trim()) return notify("Nothing to preview on this row");
    if (previewAudio.current) previewAudio.current.pause();
    setPreviewing(index);
    try {
      const res = await fetch(api.ttsPreviewUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: r.text, voice: r.voice, speed: r.speed }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      previewAudio.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      notify(`Preview failed: ${String(e).split("\n")[0]}`);
    } finally {
      setPreviewing(null);
    }
  };

  const exportAudio = async () => {
    if (rows.length === 0) return notify("Translate the audio first");
    if (audioDuration <= 0) return notify("Unknown audio duration");
    const out = `${(audioPath || "output").replace(/\.[^.]+$/, "")}_km.mp3`;
    const final = await exportJob.start(() =>
      api.exportAudio(rows, audioDuration, out, { dub_volume: 100, auto_sync_speed: true, audio_start_offset_ms: 0 })
    );
    notify(
      final.status === "done"
        ? `Exported Khmer audio → ${out}`
        : `Export failed: ${final.error?.split("\n")[0] || ""}`
    );
  };

  const progressLabel = () => {
    if (uploading) return "Importing audio…";
    if (transcribeJob.running) return `Transcribing… ${transcribeJob.job?.progress ?? 0}%`;
    if (translateJob.running) return `Translating to Khmer… ${translateJob.job?.progress ?? 0}%`;
    if (exportJob.running) return `Exporting… ${exportJob.job?.progress ?? 0}%`;
    return "";
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="panel w-[680px] max-h-[88vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-txt">🌐 Khmer Audio Translator</h2>
            <p className="text-xs text-txt-faint">Import audio → transcribe → translate to Khmer → preview → export</p>
          </div>
          <button className="text-txt-muted hover:text-txt" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-auto flex-1">
          {/* 1. Import Audio */}
          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">1 · Import Audio</h3>
            <input
              ref={audioInput}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importAudio(f);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3">
              <button className="btn-ghost" onClick={() => audioInput.current?.click()} disabled={busy}>
                📁 Choose Audio File
              </button>
              <span className="text-xs text-txt-muted truncate flex-1">
                {audioName ? `${audioName} · ${fmtClock(audioDuration)}` : "No audio imported"}
              </span>
            </div>
          </section>

          {/* 2. Translate */}
          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">2 · Translate to Khmer</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="label">Source</span>
                <select className="input py-1" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} disabled={busy}>
                  {SOURCE_LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="label">Engine</span>
                <select className="input py-1" value={engine} onChange={(e) => setEngine(e.target.value)} disabled={busy}>
                  <option value="google">Google Translate</option>
                  <option value="groq">Groq LLM</option>
                  <option value="gemini">Gemini</option>
                  <option value="nllb">NLLB-200 (offline)</option>
                </select>
              </div>
              <button className="btn-primary ml-auto" onClick={translate} disabled={busy || !audioPath}>
                Transcribe + Translate
              </button>
            </div>
          </section>

          {/* 3. Preview (rows) */}
          <section className="panel p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-txt">3 · Preview ({rows.length})</h3>
            </div>
            {rows.length === 0 ? (
              <div className="text-xs text-txt-faint py-4 text-center">
                Translated Khmer lines will appear here. Edit any line before exporting.
              </div>
            ) : (
              <div className="space-y-1 max-h-[260px] overflow-auto">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-txt-faint w-20 shrink-0 font-mono">
                      {fmtClock(r.start)}→{fmtClock(r.end)}
                    </span>
                    <input
                      className="input py-1 flex-1 text-sm"
                      value={r.text}
                      onChange={(e) => editRow(i, e.target.value)}
                      disabled={busy}
                    />
                    <button
                      className="btn-ghost px-2 shrink-0"
                      onClick={() => preview(i)}
                      disabled={busy || previewing !== null}
                      title="Preview this line (Khmer TTS)"
                    >
                      {previewing === i ? "…" : "▶"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
          <span className="text-xs text-txt-muted min-h-[1rem] flex-1 truncate">{progressLabel()}</span>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn-primary" onClick={exportAudio} disabled={busy || rows.length === 0}>
            4 · Export Khmer Audio
          </button>
        </div>
      </div>
    </div>
  );
}
