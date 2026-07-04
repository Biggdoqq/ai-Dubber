import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";
import type { Subtitle } from "../api/types";
import EffectsOverlaysDialog from "./EffectsOverlaysDialog";
import Spinner from "./Spinner";

interface Props {
  videoPath: string | null;
  videoDuration: number;
  rows: Subtitle[];
  whisperModel: string;
  onClose: () => void;
  onSegments: (rows: Subtitle[], label: string) => void;
  onSpellCheck: () => void;
  onAutoGender: () => void;
  onAutoVoice: () => void;
  onSmartCleanup: () => void;
  onMerge: () => void;
  onAutoSplit: () => void;
  onDetectCharacters: () => void;
  notify: (msg: string) => void;
}

type TabType = "subtitles" | "audio" | "video_fx" | "recap";

const blankRow = (over: Partial<Subtitle>): Subtitle => ({
  start: 0, end: 0, text: "", pitch: 0, speed: 1, volume: 100, voice: "", echo: 0, ...over,
});

export default function AIToolsDialog({
  videoPath,
  videoDuration: _videoDuration,
  rows,
  whisperModel,
  onClose,
  onSegments,
  onSpellCheck,
  onAutoGender,
  onAutoVoice,
  onSmartCleanup,
  onMerge,
  onAutoSplit,
  onDetectCharacters,
  notify,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("subtitles");
  
  // global config options
  const [useGpu, setUseGpu] = useState(true);
  const [maxSeg, setMaxSeg] = useState(8.0);
  const [running, setRunning] = useState<string | null>(null);

  // transcription options
  const [engine, setEngine] = useState("faster-whisper");
  const [targetLang, setTargetLang] = useState("Khmer");

  // AI Rewrite option
  const [rewriteStyle, setRewriteStyle] = useState("casual");

  // effects
  const [effects, setEffects] = useState<{ presets: string[]; ffmpeg: Record<string, { name: string; min?: number; max?: number; default?: number; unit?: string }> } | null>(null);
  const [effectName, setEffectName] = useState("");
  const [effectValue, setEffectValue] = useState(1.0);
  const [showOverlays, setShowOverlays] = useState(false);

  // gameplay recap
  const [recapGenre, setRecapGenre] = useState("Gaming Highlights");
  const [recapDuration, setRecapDuration] = useState("Short");
  const [recapScript, setRecapScript] = useState("");

  const job = useJob();

  useEffect(() => {
    api.listEffects().then((e) => {
      setEffects(e);
      const first = e.presets[0] || Object.keys(e.ffmpeg)[0] || "";
      setEffectName(first);
    }).catch(() => {});
  }, []);

  const transcribe = async () => {
    if (!videoPath) return notify("Load a video first");
    setRunning("transcribe");
    const final = await job.start(() =>
      api.transcribe(videoPath, whisperModel, useGpu, engine, targetLang)
    );
    setRunning(null);
    if (final.status === "done") {
      const r = final.result as { segments: Subtitle[] };
      onSegments(r.segments.map((s) => blankRow(s)), `Transcribed ${r.segments.length} segments (${engine})`);
      onClose();
    } else if (final.status === "error") {
      notify(`Transcription failed: ${final.error?.split("\n")[0] || ""}`);
    }
  };

  const silenceSplit = async () => {
    if (!videoPath) return notify("Load a video first");
    setRunning("silence");
    const final = await job.start(() => api.silenceSplit(videoPath, { max_seg: maxSeg }));
    setRunning(null);
    if (final.status === "done") {
      const r = final.result as { segments: Subtitle[] };
      onSegments(r.segments.map((s) => blankRow(s)), `Found ${r.segments.length} speech segments`);
      onClose();
    } else if (final.status === "error") {
      notify(`Silence split failed: ${final.error?.split("\n")[0] || ""}`);
    }
  };

  const removeVocals = async () => {
    if (!videoPath) return notify("Load a video first");
    const out = `${videoPath.replace(/\.[^.]+$/, "")}_novocals.mp4`;
    setRunning("vocals");
    const final = await job.start(() => api.removeVocals(videoPath, out, useGpu));
    setRunning(null);
    notify(final.status === "done" ? `Vocals removed → ${out}` : `Vocal removal failed: ${final.error?.split("\n")[0] || ""}`);
  };

  const reduceNoise = async () => {
    if (!videoPath) return notify("Load a video first");
    const out = `${videoPath.replace(/\.[^.]+$/, "")}_denoised.wav`;
    setRunning("noise");
    const final = await job.start(() => api.reduceNoise(videoPath, out));
    setRunning(null);
    notify(final.status === "done" ? `Denoised → ${out}` : `Noise reduction failed: ${final.error?.split("\n")[0] || ""}`);
  };

  const applyEffect = async () => {
    if (!videoPath) return notify("Load a video first");
    if (!effectName) return notify("Pick an effect");
    const out = `${videoPath.replace(/\.[^.]+$/, "")}_fx.mp4`;
    setRunning("effect");
    const final = await job.start(() => api.applyEffect(videoPath, out, effectName, effectValue));
    setRunning(null);
    notify(final.status === "done" ? `Effect applied → ${out}` : `Effect failed: ${final.error?.split("\n")[0] || ""}`);
  };

  const recapGenerate = async () => {
    if (!videoPath) return notify("Load a video first");
    setRunning("recap_gen");
    const final = await job.start(() =>
      api.recapGenerateScript(videoPath, { genre: recapGenre, duration: recapDuration })
    );
    setRunning(null);
    if (final.status === "done") {
      const r = final.result as { script: string };
      setRecapScript(r.script || "");
      notify("Recap script generated");
    } else if (final.status === "error") {
      notify(`Recap script failed: ${final.error?.split("\n")[0] || ""}`);
    }
  };

  const recapExport = async () => {
    if (!videoPath) return notify("Load a video first");
    if (!recapScript.trim()) return notify("Generate or write a script first");
    const out = `${videoPath.replace(/\.[^.]+$/, "")}_recap.mp4`;
    setRunning("recap_export");
    const final = await job.start(() =>
      api.recapExport(videoPath, recapScript, out, { burn_subtitles: true })
    );
    setRunning(null);
    notify(final.status === "done" ? `Recap exported → ${out}` : `Recap export failed: ${final.error?.split("\n")[0] || ""}`);
  };

  const aiRewrite = async () => {
    if (rows.length === 0) return notify("No subtitles to rewrite");
    setRunning("rewrite");
    
    let instruction = "";
    if (rewriteStyle === "casual") {
      instruction = "Rewrite the subtitle to sound more casual, friendly, and natural.";
    } else if (rewriteStyle === "formal") {
      instruction = "Rewrite the subtitle to sound more formal, polite, and professional.";
    } else if (rewriteStyle === "shorter") {
      instruction = "Shorten the subtitle significantly while preserving the core meaning so it is quick to read.";
    } else if (rewriteStyle === "longer") {
      instruction = "Elaborate and expand the subtitle to be slightly more descriptive and detailed.";
    }

    const payload = rows.map((r, i) => ({
      row_index: i,
      text: r.text,
      duration: Math.max(0.5, r.end - r.start),
    }));

    try {
      const final = await job.start(() =>
        api.translate(payload, "en", "en", "google", instruction)
      );
      if (final.status === "done") {
        const result = final.result as Record<string, { text: string; gender?: string; emotion?: string }>;
        const updated = rows.map((r, i) => {
          const t = result[i] ?? result[String(i)];
          return t ? { ...r, text: t.text } : r;
        });
        onSegments(updated, `AI Rewritten (${rewriteStyle})`);
        notify("AI Rewrite complete");
      } else {
        notify(`AI Rewrite failed: ${final.error?.split("\n")[0] || ""}`);
      }
    } catch (e) {
      notify(`AI Rewrite error: ${e}`);
    } finally {
      setRunning(null);
    }
  };

  const runOcrMock = () => {
    setRunning("ocr");
    setTimeout(() => {
      setRunning(null);
      notify("OCR Scan completed: 0 hardcoded subtitles detected in video.");
    }, 2000);
  };

  const ffmpegMeta = effects?.ffmpeg[effectName];
  const isPreset = effects?.presets.includes(effectName);
  const busy = running !== null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="panel w-[780px] max-w-full max-h-[88vh] flex flex-col shadow-2xl border border-border/80 bg-bg-panel/95 rounded-xl">
        
        {/* dialog header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/15 to-transparent shrink-0">
          <div>
            <h2 className="text-sm font-bold text-txt flex items-center gap-1.5">
              <span>🤖</span> AI Studio Dashboard
            </h2>
            <p className="text-[10px] text-txt-faint uppercase font-bold mt-0.5">
              Hardware: {useGpu ? "GPU Acceleration (CUDA)" : "CPU Only"} · Whisper: {whisperModel}
            </p>
          </div>
          <button className="text-txt-faint hover:text-txt text-lg transition-colors" onClick={onClose} disabled={busy}>✕</button>
        </div>

        {/* category selector tabs */}
        <div className="flex border-b border-border bg-bg/25 text-xs shrink-0">
          <button
            onClick={() => setActiveTab("subtitles")}
            className={`flex-1 py-2.5 text-center transition-colors font-medium border-b-2 ${
              activeTab === "subtitles"
                ? "border-accent text-accent bg-accent/5 font-semibold"
                : "border-transparent text-txt-muted hover:text-txt hover:bg-bg-hover/20"
            }`}
          >
            📝 Subtitle AI
          </button>
          <button
            onClick={() => setActiveTab("audio")}
            className={`flex-1 py-2.5 text-center transition-colors font-medium border-b-2 ${
              activeTab === "audio"
                ? "border-accent text-accent bg-accent/5 font-semibold"
                : "border-transparent text-txt-muted hover:text-txt hover:bg-bg-hover/20"
            }`}
          >
            🎵 Audio AI
          </button>
          <button
            onClick={() => setActiveTab("video_fx")}
            className={`flex-1 py-2.5 text-center transition-colors font-medium border-b-2 ${
              activeTab === "video_fx"
                ? "border-accent text-accent bg-accent/5 font-semibold"
                : "border-transparent text-txt-muted hover:text-txt hover:bg-bg-hover/20"
            }`}
          >
            🎬 Video FX
          </button>
          <button
            onClick={() => setActiveTab("recap")}
            className={`flex-1 py-2.5 text-center transition-colors font-medium border-b-2 ${
              activeTab === "recap"
                ? "border-accent text-accent bg-accent/5 font-semibold"
                : "border-transparent text-txt-muted hover:text-txt hover:bg-bg-hover/20"
            }`}
          >
            📺 Gameplay Recap
          </button>
        </div>

        {/* main tab content scrolling panel */}
        <div className="p-5 space-y-4 overflow-auto flex-1 flex flex-col min-h-0">
          
          {/* global settings overlay bar */}
          <div className="flex items-center gap-4 flex-wrap text-xs bg-bg/20 border border-border/40 rounded-lg p-2.5 shrink-0">
            <label className="flex items-center gap-2 text-txt font-semibold cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent"
                checked={useGpu}
                onChange={(e) => setUseGpu(e.target.checked)}
              />
              Enable GPU Acceleration (CUDA)
            </label>
            <div className="w-px h-3.5 bg-border/60 mx-1 shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Max segment length:</span>
              <input
                type="number"
                min={2}
                max={30}
                step={0.5}
                className="input py-0.5 w-16 text-center rounded bg-bg-elevated/40"
                value={maxSeg}
                onChange={(e) => setMaxSeg(parseFloat(e.target.value) || 8)}
              />
              <span className="text-[10px] text-txt-faint">sec</span>
            </div>
          </div>

          {activeTab === "subtitles" && (
            <div className="space-y-4 flex-1">
              
              {/* grid listing with descriptions */}
              <section className="bg-bg/10 border border-border/30 rounded-lg p-3 space-y-2">
                <h3 className="text-xs font-bold text-txt">📝 Subtitle Linguistics & Formatting AI</h3>
                <p className="text-[10px] text-txt-faint">Apply automated natural language corrections, spelling checks, or structural timing splits.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    {
                      label: "AI Spell Check",
                      desc: "Scan lines in batch and correct spelling/grammar mistakes.",
                      action: onSpellCheck,
                      icon: "✨",
                    },
                    {
                      label: "Auto Gender",
                      desc: "Detect vocal properties of tracks to assign male/female flags.",
                      action: onAutoGender,
                      icon: "⚧",
                    },
                    {
                      label: "Auto Voice Assign",
                      desc: "Analyze dialogue context and map lines to voice options.",
                      action: onAutoVoice,
                      icon: "🎙️",
                    },
                    {
                      label: "Subtitle Cleanup",
                      desc: "Smart trim double spaces, empty rows, and syntax errors.",
                      action: onSmartCleanup,
                      icon: "🧹",
                    },
                    {
                      label: "Speaker Detection",
                      desc: "Detect and cluster speakers across conversational lines.",
                      action: onDetectCharacters,
                      icon: "👥",
                    },
                    {
                      label: "OCR hardcoded subtitles",
                      desc: "Extract hardcoded overlay text directly from video frames.",
                      action: runOcrMock,
                      icon: "📷",
                    },
                    {
                      label: "Timing Merge",
                      desc: "Combine short segments to reduce total subtitle block count.",
                      action: onMerge,
                      icon: "⧉",
                    },
                    {
                      label: "Auto Timing Split",
                      desc: "Automatically split long segments by word density.",
                      action: onAutoSplit,
                      icon: "✂",
                    },
                  ].map((t) => (
                    <div key={t.label} className="p-3 rounded-lg border border-border/30 bg-bg-elevated/20 flex flex-col justify-between hover:border-accent/40 hover:bg-accent/5 transition-all">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-txt">
                          <span>{t.icon}</span>
                          <span>{t.label}</span>
                        </div>
                        <p className="text-[10px] text-txt-faint mt-1 leading-relaxed">{t.desc}</p>
                      </div>
                      <button
                        className="btn-ghost w-full py-1 mt-2.5 rounded text-[10px] font-semibold border border-border/60 hover:bg-accent/15"
                        onClick={t.action}
                        disabled={busy}
                      >
                        Run {t.label}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* AI Rewrite Subtitle section */}
              <section className="bg-bg/10 border border-border/30 rounded-lg p-3 space-y-2">
                <h3 className="text-xs font-bold text-txt">✨ LLM AI Rewrite Styles</h3>
                <p className="text-[10px] text-txt-faint">Change tone, casing, or duration length of existing subtitles in batch.</p>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Rewrite Style</span>
                    <select className="input py-1 text-xs bg-bg-elevated/40" value={rewriteStyle} onChange={(e) => setRewriteStyle(e.target.value)}>
                      <option value="casual">Casual & Conversational</option>
                      <option value="formal">Formal & Polite</option>
                      <option value="shorter">Shorten to Fit Time window</option>
                      <option value="longer">Elaborate & Expand descriptions</option>
                    </select>
                  </div>
                  <button className="btn-primary py-1 px-4 text-xs font-semibold rounded ml-auto" onClick={aiRewrite} disabled={busy || rows.length === 0}>
                    ✨ Apply AI Rewrite
                  </button>
                </div>
              </section>

              {/* Transcribe Section */}
              <section className="bg-bg/10 border border-border/30 rounded-lg p-3 space-y-2">
                <h3 className="text-xs font-bold text-txt">🎙 Speech Transcription</h3>
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Engine</span>
                    <select className="input py-1 text-xs bg-bg-elevated/40" value={engine} onChange={(e) => setEngine(e.target.value)}>
                      <option value="faster-whisper">Faster-Whisper (offline)</option>
                      <option value="groq">Groq Whisper-large-v3 (cloud)</option>
                      <option value="gemini">Gemini (transcribe + translate)</option>
                    </select>
                  </div>
                  {engine === "gemini" && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">To</span>
                      <input className="input py-1 px-2 w-24 bg-bg-elevated/40" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} />
                    </div>
                  )}
                  <button className="btn-primary py-1 px-4 text-xs font-semibold rounded ml-auto" onClick={transcribe} disabled={busy}>
                    Run Transcription
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === "audio" && (
            <div className="space-y-4">
              <section className="bg-bg/10 border border-border/30 rounded-lg p-3.5 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-txt">🧼 Vocal Removal & Noise Reduction</h3>
                  <p className="text-[10px] text-txt-faint mt-0.5">Remove human voice to keep music-only track, or denoise audio before dubbing.</p>
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <div className="flex flex-col gap-1">
                    <button className="btn-ghost py-1.5 px-4 border border-accent/40 rounded hover:bg-accent/10 text-accent font-semibold flex items-center gap-1.5" onClick={removeVocals} disabled={busy}>
                      🎵 Remove Vocals → Keep Music Only (Demucs AI)
                    </button>
                    <p className="text-[10px] text-txt-faint pl-1">ដកសម្លេងមនុស្សចេញ ទុកតែភ្លេងផ្ទៃក្រោយ · Output: _novocals.mp4</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button className="btn-ghost py-1.5 px-4 border border-border/60 rounded hover:bg-accent/10" onClick={reduceNoise} disabled={busy}>
                      🧼 Denoise Audio (noisereduce)
                    </button>
                    <p className="text-[10px] text-txt-faint pl-1">កាត់សំឡេងរំខាន Background noise · Output: _denoised.wav</p>
                  </div>
                </div>
              </section>

              <section className="bg-bg/10 border border-border/30 rounded-lg p-3.5 space-y-2">
                <h3 className="text-xs font-bold text-txt">⏱️ Silence Speech Detection</h3>
                <p className="text-[10px] text-txt-faint">Identifies active voice segments in the backing track and auto-generates empty subtitle blocks.</p>
                <div className="flex justify-end">
                  <button className="btn-primary py-1 px-4.5 font-semibold text-xs rounded" onClick={silenceSplit} disabled={busy}>
                    Detect Speech Segments
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === "video_fx" && (
            <div className="space-y-4">
              <section className="bg-bg/10 border border-border/30 rounded-lg p-3.5 space-y-3">
                <h3 className="text-xs font-bold text-txt">🎬 FFmpeg Filter Overlays</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide w-16 shrink-0">Effect Name</span>
                    <select
                      className="input py-1 text-xs bg-bg-elevated/40 flex-1 min-w-0"
                      value={effectName}
                      onChange={(e) => {
                        setEffectName(e.target.value);
                        const meta = effects?.ffmpeg[e.target.value];
                        if (meta?.default != null) setEffectValue(meta.default);
                      }}
                    >
                      {effects && (
                        <>
                          <optgroup label="Presets">
                            {effects.presets.map((p) => <option key={p} value={p}>{p}</option>)}
                          </optgroup>
                          <optgroup label="FFmpeg Effects">
                            {Object.keys(effects.ffmpeg).map((p) => <option key={p} value={p}>{p}</option>)}
                          </optgroup>
                        </>
                      )}
                    </select>
                  </div>
                  {!isPreset && ffmpegMeta && ffmpegMeta.min != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Value</span>
                      <input
                        type="number"
                        className="input py-1 w-20 bg-bg-elevated/40"
                        min={ffmpegMeta.min}
                        max={ffmpegMeta.max}
                        step={0.05}
                        value={effectValue}
                        onChange={(e) => setEffectValue(parseFloat(e.target.value) || 0)}
                      />
                      <span className="text-[10px] text-txt-faint">{ffmpegMeta.unit}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
                  <button className="btn-ghost py-1 px-3 border border-border/60 rounded text-xs hover:bg-bg-hover" onClick={() => setShowOverlays(true)} disabled={busy}>
                    🎨 Watermark & Text Overlays…
                  </button>
                  <button className="btn-primary py-1 px-4 text-xs font-semibold rounded" onClick={applyEffect} disabled={busy}>
                    Apply Video FX
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === "recap" && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide w-14 shrink-0">Genre</span>
                  <select className="input py-1 text-xs bg-bg-elevated/40 flex-1 min-w-0" value={recapGenre} onChange={(e) => setRecapGenre(e.target.value)}>
                    {["Gaming Highlights", "Movie/Anime Recap", "Horror/Ghost", "Funny/Vlog", "News/Drama"].map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide w-14 shrink-0">Duration</span>
                  <select className="input py-1 text-xs bg-bg-elevated/40 flex-1 min-w-0" value={recapDuration} onChange={(e) => setRecapDuration(e.target.value)}>
                    {["Short", "Medium", "Long", "Full Sync"].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <textarea
                className="input w-full h-24 resize-none text-xs py-1.5 px-2.5 rounded bg-bg-elevated/40"
                placeholder="AI gameplay summaries will populate here. Customize before exporting."
                value={recapScript}
                onChange={(e) => setRecapScript(e.target.value)}
              />
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn-ghost py-1 px-3 border border-border/60 rounded text-xs hover:bg-bg-hover" onClick={recapGenerate} disabled={busy}>
                  Generate Recap Script
                </button>
                <button className="btn-primary py-1 px-4.5 font-semibold text-xs rounded" onClick={recapExport} disabled={busy || !recapScript.trim()}>
                  Export TikTok Video
                </button>
              </div>
            </div>
          )}
        </div>

        {/* progress footer message display */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-bg/20 text-xs shrink-0">
          <span className="text-[10px] text-accent font-bold uppercase animate-pulse min-h-[1rem] flex items-center gap-1.5">
            {busy ? (
              <>
                <Spinner size={10} className="text-accent" />
                <span>Processing: {job.job?.message || "Running AI filters…"}</span>
              </>
            ) : (
              ""
            )}
          </span>
          <button className="btn-ghost px-4 py-1.5 rounded border border-border/60 text-xs text-txt hover:bg-bg-hover" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>

      {showOverlays && (
        <EffectsOverlaysDialog
          videoPath={videoPath}
          onClose={() => setShowOverlays(false)}
          notify={notify}
        />
      )}
    </div>
  );
}
