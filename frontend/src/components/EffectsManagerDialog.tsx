import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";
import EffectsOverlaysDialog from "./EffectsOverlaysDialog";

interface Props {
  videoPath: string | null;
  onClose: () => void;
  notify: (msg: string) => void;
}

const stem = (p: string) => p.replace(/\.[^.]+$/, "");

export default function EffectsManagerDialog({ videoPath, onClose, notify }: Props) {
  const [useGpu, setUseGpu] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const [audioEffects, setAudioEffects] = useState<string[]>([]);
  const [audioEffect, setAudioEffect] = useState("");

  const [videoEffects, setVideoEffects] = useState<{
    presets: string[];
    ffmpeg: Record<string, { name: string; min?: number; max?: number; default?: number; unit?: string }>;
  } | null>(null);
  const [videoEffect, setVideoEffect] = useState("");
  const [videoValue, setVideoValue] = useState(1.0);
  const [showOverlays, setShowOverlays] = useState(false);

  const job = useJob();

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

  const run = async (id: string, start: () => Promise<{ job_id: string }>, okMsg: (out: string) => string, out: string) => {
    if (!videoPath) return notify("Load a video first");
    setRunning(id);
    const final = await job.start(start);
    setRunning(null);
    notify(final.status === "done" ? okMsg(out) : `Failed: ${final.error?.split("\n")[0] || ""}`);
  };

  const removeVocal = () => {
    const out = `${stem(videoPath!)}_novocals.mp4`;
    run("vocals", () => api.removeVocals(videoPath!, out, useGpu), (o) => `Vocals removed → ${o}`, out);
  };
  const reduceNoise = () => {
    const out = `${stem(videoPath!)}_denoised.wav`;
    run("noise", () => api.reduceNoise(videoPath!, out), (o) => `Denoised → ${o}`, out);
  };
  const enhanceVoice = () => {
    const out = `${stem(videoPath!)}_enhanced.mp4`;
    run("enhance", () => api.enhanceVoice(videoPath!, out), (o) => `Voice enhanced → ${o}`, out);
  };
  const applyAudioEffect = () => {
    if (!audioEffect) return notify("Pick an audio effect");
    const out = `${stem(videoPath!)}_audiofx.mp4`;
    run("audiofx", () => api.applyAudioEffect(videoPath!, out, audioEffect), (o) => `${audioEffect} applied → ${o}`, out);
  };
  const applyVideoEffect = () => {
    if (!videoEffect) return notify("Pick a video effect");
    const out = `${stem(videoPath!)}_fx.mp4`;
    run("videofx", () => api.applyEffect(videoPath!, out, videoEffect, videoValue), (o) => `${videoEffect} applied → ${o}`, out);
  };

  const busy = running !== null;
  const ffmpegMeta = videoEffects?.ffmpeg[videoEffect];
  const isPreset = videoEffects?.presets.includes(videoEffect);
  const Spinner = ({ id }: { id: string }) =>
    running === id ? <span className="text-xs text-accent ml-2">{job.job?.progress ?? 0}%</span> : null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="panel w-[620px] max-h-[88vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-txt">Effects Manager</h2>
          <button className="text-txt-muted hover:text-txt" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-auto flex-1">
          {!videoPath && (
            <p className="text-xs text-amber-400">Load a video to enable processing.</p>
          )}

          <label className="flex items-center gap-2 text-sm text-txt">
            <input type="checkbox" className="accent-accent" checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} />
            Use GPU (CUDA) — applies to vocal removal
          </label>

          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">Remove Vocal</h3>
            <div className="flex items-center gap-3">
              <p className="text-xs text-txt-muted flex-1">
                Strip vocals with Demucs (mdx_extra), keeping the instrumental muxed over the video.
              </p>
              <button className="btn-primary" onClick={removeVocal} disabled={busy || !videoPath}>
                Remove Vocal<Spinner id="vocals" />
              </button>
            </div>
          </section>

          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">Noise Reduction</h3>
            <div className="flex items-center gap-3">
              <p className="text-xs text-txt-muted flex-1">
                Denoise the audio track (noisereduce, FFmpeg afftdn fallback). Writes a cleaned WAV.
              </p>
              <button className="btn-ghost" onClick={reduceNoise} disabled={busy || !videoPath}>
                Reduce Noise<Spinner id="noise" />
              </button>
            </div>
          </section>

          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">Voice Enhancement</h3>
            <div className="flex items-center gap-3">
              <p className="text-xs text-txt-muted flex-1">
                Speech-clarity chain: rumble/hiss filter, presence lift, compression, loudness normalize. Video preserved.
              </p>
              <button className="btn-ghost" onClick={enhanceVoice} disabled={busy || !videoPath}>
                Enhance Voice<Spinner id="enhance" />
              </button>
            </div>
          </section>

          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">Audio Effects</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="label">Effect</span>
                <select className="input py-1" value={audioEffect} onChange={(e) => setAudioEffect(e.target.value)}>
                  {audioEffects.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button className="btn-ghost ml-auto" onClick={applyAudioEffect} disabled={busy || !videoPath}>
                Apply Audio Effect<Spinner id="audiofx" />
              </button>
            </div>
            <p className="text-xs text-txt-faint">FFmpeg audio filter, applied to the audio track (video copied).</p>
          </section>

          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">Video Effects</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="label">Effect</span>
                <select
                  className="input py-1"
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
                <div className="flex items-center gap-1">
                  <span className="label">Value</span>
                  <input
                    type="number"
                    className="input py-1 w-24"
                    min={ffmpegMeta.min}
                    max={ffmpegMeta.max}
                    step={0.05}
                    value={videoValue}
                    onChange={(e) => setVideoValue(parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-xs text-txt-faint">{ffmpegMeta.unit}</span>
                </div>
              )}
              <button className="btn-ghost ml-auto" onClick={applyVideoEffect} disabled={busy || !videoPath}>
                Apply Effect<Spinner id="videofx" />
              </button>
              <button className="btn-ghost" onClick={() => setShowOverlays(true)} disabled={busy}>
                Overlays…
              </button>
            </div>
            <p className="text-xs text-txt-faint">
              Reuses the legacy Effect.py preset/FFmpeg filter library. "Overlays…" opens the watermark/blur/text editor.
            </p>
          </section>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-txt-muted min-h-[1rem]">
            {busy ? job.job?.message || "Working…" : ""}
          </span>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </div>

      {showOverlays && (
        <EffectsOverlaysDialog videoPath={videoPath} onClose={() => setShowOverlays(false)} notify={notify} />
      )}
    </div>
  );
}
