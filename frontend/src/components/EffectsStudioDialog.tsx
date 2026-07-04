import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";
import EffectsOverlaysDialog from "./EffectsOverlaysDialog";
import Spinner from "./Spinner";

interface Props {
  videoPath: string | null;
  onClose?: () => void;
  notify: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
  inline?: boolean;
}

const stem = (p: string) => p.replace(/\.[^.]+$/, "");

type FeatureId = "vocal" | "noise" | "normalize" | "compressor" | "echo" | "reverb" | "voicefx" | "videofx" | "bg";

interface Feature {
  id: FeatureId;
  icon: string;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { id: "vocal", icon: "🎤", title: "Remove Vocal", desc: "Strip vocals with Demucs (mdx_extra) and mux the instrumental back over the video." },
  { id: "noise", icon: "🔇", title: "Noise Reduction", desc: "Denoise the audio track (noisereduce, with an FFmpeg afftdn fallback)." },
  { id: "normalize", icon: "⚖️", title: "Normalize", desc: "Loudness normalize the audio track to broadcast standards (EBU R128 at -16 LUFS)." },
  { id: "compressor", icon: "🗜️", title: "Compressor", desc: "Apply dynamic range compression to smooth out audio peaks and enhance speech clarity." },
  { id: "echo", icon: "📡", title: "Echo Delay", desc: "Apply a delay-based echo filter (aecho) to create spacious repeating audio reflections." },
  { id: "reverb", icon: "🌌", title: "Reverb Hall", desc: "Simulate physical environments (hall, room, chamber) with customizable decay and mix ratios." },
  { id: "voicefx", icon: "🎚️", title: "Audio Effects", desc: "Apply pre-configured audio filter presets (Bass Boost, Treble Boost, Telephone, Warmth, etc.)." },
  { id: "videofx", icon: "🎬", title: "Video Effects", desc: "Apply a legacy Effect.py preset or FFmpeg video filter, plus watermark/blur/text overlays." },
  { id: "bg", icon: "🎵", title: "Background Audio", desc: "Mix a looping background track under the video's existing audio." },
];

export default function EffectsStudioDialog({ videoPath, onClose, notify, inline = false }: Props) {
  const [active, setActive] = useState<FeatureId>("vocal");
  const [useGpu, setUseGpu] = useState(true);

  const [audioEffects, setAudioEffects] = useState<string[]>([]);
  const [audioEffect, setAudioEffect] = useState("");

  const [videoEffects, setVideoEffects] = useState<{
    presets: string[];
    ffmpeg: Record<string, { name: string; min?: number; max?: number; default?: number; unit?: string }>;
  } | null>(null);
  const [videoEffect, setVideoEffect] = useState("");
  const [videoValue, setVideoValue] = useState(1.0);
  const [showOverlays, setShowOverlays] = useState(false);

  // Reverb presets selection
  const [reverbPreset, setReverbPreset] = useState("Reverb (Hall)");

  // background audio
  const [bgPath, setBgPath] = useState("");
  const [bgVolume, setBgVolume] = useState(30);
  const [mainVolume, setMainVolume] = useState(100);
  const [loopBg, setLoopBg] = useState(true);
  const bgUpload = useRef<HTMLInputElement>(null);

  const job = useJob();
  const [running, setRunning] = useState<FeatureId | null>(null);
  const busy = running !== null;

  useEffect(() => {
    api.listAudioEffects().then((r) => {
      setAudioEffects(r.effects);
      setAudioEffect(r.effects[0] || "");
    }).catch(() => {});
    api.listEffects().then((e) => {
      setVideoEffects(e);
      setVideoEffect(e.presets[0] || Object.keys(e.ffmpeg)[0] || "");
    }).catch(() => {});
  }, []);

  const run = async (
    id: FeatureId,
    start: () => Promise<{ job_id: string }>,
    okMsg: (out: string) => string,
    out: string
  ) => {
    if (!videoPath) return notify("Load a video first", "warning");
    setRunning(id);
    const final = await job.start(start);
    setRunning(null);
    if (final.status === "done") notify(okMsg(out), "success");
    else notify(`Failed: ${final.error?.split("\n")[0] || ""}`, "error");
  };

  const removeVocal = () => {
    const out = `${stem(videoPath!)}_novocals.mp4`;
    run("vocal", () => api.removeVocals(videoPath!, out, useGpu), (o) => `Vocals removed → ${o}`, out);
  };
  
  const reduceNoise = () => {
    const out = `${stem(videoPath!)}_denoised.wav`;
    run("noise", () => api.reduceNoise(videoPath!, out), (o) => `Denoised → ${o}`, out);
  };

  const applyNormalize = () => {
    const out = `${stem(videoPath!)}_normalized.mp4`;
    run("normalize", () => api.applyAudioEffect(videoPath!, out, "Loudness Normalize"), (o) => `Loudness Normalized → ${o}`, out);
  };

  const applyCompressor = () => {
    const out = `${stem(videoPath!)}_compressed.mp4`;
    run("compressor", () => api.applyAudioEffect(videoPath!, out, "Compressor"), (o) => `Compressed → ${o}`, out);
  };

  const applyEcho = () => {
    const out = `${stem(videoPath!)}_echo.mp4`;
    run("echo", () => api.applyAudioEffect(videoPath!, out, "Echo"), (o) => `Echo applied → ${o}`, out);
  };

  const applyReverb = () => {
    const out = `${stem(videoPath!)}_reverb.mp4`;
    run("reverb", () => api.applyAudioEffect(videoPath!, out, reverbPreset), (o) => `Reverb applied → ${o}`, out);
  };

  const applyVoiceFx = () => {
    if (!audioEffect) return notify("Pick an audio effect", "warning");
    const out = `${stem(videoPath!)}_audiofx.mp4`;
    run("voicefx", () => api.applyAudioEffect(videoPath!, out, audioEffect), (o) => `${audioEffect} → ${o}`, out);
  };

  const applyVideoFx = () => {
    if (!videoEffect) return notify("Pick a video effect", "warning");
    const out = `${stem(videoPath!)}_fx.mp4`;
    run("videofx", () => api.applyEffect(videoPath!, out, videoEffect, videoValue), (o) => `${videoEffect} → ${o}`, out);
  };

  const mixBackground = () => {
    if (!bgPath.trim()) return notify("Choose background audio file first", "warning");
    const out = `${stem(videoPath!)}_bgmix.mp4`;
    run(
      "bg",
      () => api.backgroundAudio(videoPath!, bgPath.trim(), out, {
        bg_volume: bgVolume, main_volume: mainVolume, loop_bg: loopBg,
      }),
      (o) => `Background mixed → ${o}`,
      out
    );
  };

  const uploadBg = async (file: File) => {
    try {
      const res = await api.uploadMedia(file);
      setBgPath(res.path);
      notify(`Background clip uploaded: ${res.name}`, "success");
    } catch (e) {
      notify(`Upload failed: ${String(e).split("\n")[0]}`, "error");
    }
  };

  const feature = FEATURES.find((f) => f.id === active)!;
  const ffmpegMeta = videoEffects?.ffmpeg[videoEffect];
  const isPreset = videoEffects?.presets.includes(videoEffect);

  const RunButton = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      className="btn-primary py-1.5 px-4 text-xs font-semibold rounded shadow-md flex items-center justify-center gap-1.5 min-w-[140px]"
      onClick={onClick}
      disabled={busy || !videoPath || disabled}
    >
      {running === active ? (
        <>
          <Spinner size={10} className="text-white" />
          <span>Processing…</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );

  const innerContent = (
    <div className="flex-1 flex min-h-0">
      
      {/* sidebar features navigation */}
      <nav className="w-56 shrink-0 border-r border-border/40 overflow-y-auto p-2.5 space-y-1 bg-bg/15">
        {FEATURES.map((f) => (
          <button
            key={f.id}
            onClick={() => setActive(f.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-left transition-all ${
              active === f.id
                ? "bg-accent/15 text-accent font-semibold shadow-sm border-l-2 border-accent"
                : "text-txt-muted hover:text-txt hover:bg-bg-hover/20"
            }`}
          >
            <span className="text-sm shrink-0">{f.icon}</span>
            <span className="truncate">{f.title}</span>
            {running === f.id && <span className="ml-auto text-[8px] text-accent animate-ping">●</span>}
          </button>
        ))}
      </nav>

      {/* main feature configuration screen */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-start gap-3 border-b border-border/30 pb-3">
            <span className="text-3xl">{feature.icon}</span>
            <div>
              <h3 className="text-sm font-bold text-txt">{feature.title}</h3>
              <p className="text-xs text-txt-muted mt-1">{feature.desc}</p>
            </div>
          </div>

          {active === "vocal" && (
            <div className="space-y-4 text-xs">
              <label className="flex items-center gap-2.5 text-txt font-semibold cursor-pointer">
                <input type="checkbox" className="accent-accent" checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} />
                Use local GPU hardware acceleration (requires CUDA compatible card)
              </label>
              <div className="pt-2 border-t border-border/20">
                <RunButton label="Extract Instrumental Track" onClick={removeVocal} />
              </div>
            </div>
          )}

          {active === "noise" && (
            <div className="space-y-4 text-xs">
              <p className="text-txt-muted">Removes stationary background hiss, fan noise, and electrical hum from the video track.</p>
              <div className="pt-2 border-t border-border/20">
                <RunButton label="Reduce Noise" onClick={reduceNoise} />
              </div>
            </div>
          )}

          {active === "normalize" && (
            <div className="space-y-4 text-xs">
              <p className="text-txt-muted">Normalizes the audio loudness to -16 LUFS (standard for web video speech output).</p>
              <div className="pt-2 border-t border-border/20">
                <RunButton label="Loudness Normalize" onClick={applyNormalize} />
              </div>
            </div>
          )}

          {active === "compressor" && (
            <div className="space-y-4 text-xs">
              <p className="text-txt-muted">Evens out loudness peaks and spikes so whisper-quiet speech remains legible alongside louder speech segments.</p>
              <div className="pt-2 border-t border-border/20">
                <RunButton label="Apply Compressor" onClick={applyCompressor} />
              </div>
            </div>
          )}

          {active === "echo" && (
            <div className="space-y-4 text-xs">
              <p className="text-txt-muted">Generates a spacious, repeating delay echo (aecho) in the background dub track.</p>
              <div className="pt-2 border-t border-border/20">
                <RunButton label="Apply Echo Delay" onClick={applyEcho} />
              </div>
            </div>
          )}

          {active === "reverb" && (
            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Reverb Space Preset:</label>
                <select className="input py-1 text-xs w-48 bg-bg-elevated/40" value={reverbPreset} onChange={(e) => setReverbPreset(e.target.value)}>
                  <option value="Reverb (Room)">Room (Small Chamber)</option>
                  <option value="Reverb (Hall)">Hall (Large Ambient Hall)</option>
                  <option value="Reverb (Plate)">Plate (Retro Studio Reverb)</option>
                </select>
              </div>
              <div className="pt-2 border-t border-border/20">
                <RunButton label="Apply Reverb Preset" onClick={applyReverb} />
              </div>
            </div>
          )}

          {active === "voicefx" && (
            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Filter Preset Type:</label>
                <select className="input py-1 text-xs w-48 bg-bg-elevated/40" value={audioEffect} onChange={(e) => setAudioEffect(e.target.value)}>
                  {audioEffects.map((ae) => <option key={ae} value={ae}>{ae}</option>)}
                </select>
              </div>
              <div className="pt-2 border-t border-border/20">
                <RunButton label="Apply Voice Preset" onClick={applyVoiceFx} />
              </div>
            </div>
          )}

          {active === "videofx" && (
            <div className="space-y-4 text-xs">
              <div className="flex gap-4">
                <div>
                  <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Preset / Filter Name:</label>
                  <select
                    className="input py-1 text-xs w-48 bg-bg-elevated/40 font-mono"
                    value={videoEffect}
                    onChange={(e) => {
                      setVideoEffect(e.target.value);
                      const meta = videoEffects?.ffmpeg[e.target.value];
                      if (meta?.default != null) setVideoValue(meta.default);
                    }}
                  >
                    {videoEffects && (
                      <>
                        <optgroup label="Presets">
                          {videoEffects.presets.map((p) => <option key={p} value={p}>{p}</option>)}
                        </optgroup>
                        <optgroup label="FFmpeg Effects">
                          {Object.keys(videoEffects.ffmpeg).map((p) => <option key={p} value={p}>{p}</option>)}
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
                      value={videoValue}
                      onChange={(e) => setVideoValue(parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-[10px] text-txt-faint">{ffmpegMeta.unit}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2.5 pt-2 border-t border-border/20">
                <RunButton label="Apply Video Effect" onClick={applyVideoFx} />
                <button className="btn-ghost py-1 px-3 border border-border/60 rounded hover:bg-bg-hover text-xs" onClick={() => setShowOverlays(true)} disabled={busy || !videoPath}>
                  🎨 Watermark & Water Blurring overlays…
                </button>
              </div>
            </div>
          )}

          {active === "bg" && (
            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1.5">Background Audio Server Path:</label>
                <input
                  className="input w-full font-mono text-xs py-1.5 px-2.5 bg-bg-elevated/40 rounded"
                  placeholder="e.g. C:\\projects\\backing_music.mp3"
                  value={bgPath}
                  onChange={(e) => setBgPath(e.target.value)}
                />
                <input
                  ref={bgUpload}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadBg(f);
                    e.target.value = "";
                  }}
                />
                <button className="btn-ghost text-[10px] py-1 px-2.5 border border-border/50 rounded mt-2 hover:bg-bg-hover" onClick={() => bgUpload.current?.click()}>
                  Upload Background File
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-1.5">
                <div>
                  <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Background Mix Vol ({bgVolume}%)</label>
                  <input type="range" min={0} max={200} value={bgVolume} onChange={(e) => setBgVolume(parseInt(e.target.value))} className="w-full accent-accent" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Original Video Vol ({mainVolume}%)</label>
                  <input type="range" min={0} max={200} value={mainVolume} onChange={(e) => setMainVolume(parseInt(e.target.value))} className="w-full accent-accent" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-txt font-semibold cursor-pointer">
                <input type="checkbox" className="accent-accent" checked={loopBg} onChange={(e) => setLoopBg(e.target.checked)} />
                Loop background track continuously
              </label>
              <div className="pt-2 border-t border-border/20">
                <RunButton label="Mix Background Audio" onClick={mixBackground} disabled={!bgPath.trim()} />
              </div>
            </div>
          )}
        </div>

        {/* task tracking logs inside card */}
        <div className="bg-bg/20 border border-border/40 p-3.5 rounded-lg text-[10px] font-mono text-txt-faint flex flex-col gap-1.5 shrink-0 mt-4">
          <div className="flex items-center justify-between">
            <span>Status: {busy ? `⌛ Processing: ${job.job?.message || "Running filter task…"}` : "Idle"}</span>
            <span>All outputs save beside source files automatically.</span>
          </div>
          {busy && (
            <div className="w-full h-1 bg-border/20 rounded overflow-hidden mt-1">
              <div className="h-full bg-accent transition-all duration-300 animate-pulse" style={{ width: `${job.job?.progress ?? 0}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-transparent text-xs h-full w-full overflow-hidden">
        {innerContent}
        {showOverlays && (
          <EffectsOverlaysDialog videoPath={videoPath} onClose={() => setShowOverlays(false)} notify={notify} />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="panel w-[900px] max-w-full max-h-[90vh] flex flex-col shadow-2xl border border-border/80 bg-bg-panel/95 rounded-xl">
        
        {/* dialog header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/15 to-transparent shrink-0">
          <div>
            <h2 className="text-sm font-bold text-txt flex items-center gap-1.5">
              <span>🎛️</span> Antigravity Effects Studio
            </h2>
            <p className="text-[10px] text-txt-faint uppercase font-bold mt-0.5">
              Apply advanced audio DSP filters and video render presets
            </p>
          </div>
          <button className="text-txt-faint hover:text-txt text-lg transition-colors" onClick={onClose} disabled={busy}>✕</button>
        </div>

        {innerContent}

        {/* dialog footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-bg/25 text-xs shrink-0">
          <span className="text-[10px] text-txt-faint font-semibold uppercase flex items-center gap-1.5">
            {busy ? (
              <>
                <Spinner size={10} className="text-accent" />
                <span>Running Active FX Render Pipeline</span>
              </>
            ) : (
              <span>⏱️ Pipeline Ready</span>
            )}
          </span>
          <button className="btn-ghost px-4 py-1.5 rounded border border-border/60 text-xs text-txt hover:bg-bg-hover" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>

      {showOverlays && (
        <EffectsOverlaysDialog videoPath={videoPath} onClose={() => setShowOverlays(false)} notify={notify} />
      )}
    </div>
  );
}
