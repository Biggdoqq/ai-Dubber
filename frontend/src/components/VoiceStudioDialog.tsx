import { useEffect, useRef, useState, useMemo } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";
import type { Subtitle, Voice } from "../api/types";
import Icon from "./Icon";
import Spinner from "./Spinner";

interface Props {
  voices: Voice[];
  rows: Subtitle[];
  selected: Set<number>;
  videoPath: string | null;
  onApply: (patch: Partial<Subtitle>, target: "selected" | "all") => void;
  onClose: () => void;
  notify: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
}

const EMOTIONS = ["Normal", "Happy", "Sad", "Angry", "Whispering", "Shouting"];

type FieldKey = "voice" | "emotion" | "pitch" | "speed" | "volume" | "echo" | "stability" | "similarity";

export default function VoiceStudioDialog({
  voices,
  rows,
  selected,
  videoPath,
  onApply,
  onClose,
  notify,
}: Props) {
  const [voice, setVoice] = useState("");
  const [emotion, setEmotion] = useState("Normal");
  const [pitch, setPitch] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(100);
  const [echo, setEcho] = useState(0);
  const [stability, setStability] = useState(75);
  const [similarity, setSimilarity] = useState(85);
  const [refWav, setRefWav] = useState("");

  const [enabled, setEnabled] = useState<Record<FieldKey, boolean>>({
    voice: true,
    emotion: false,
    pitch: false,
    speed: false,
    volume: false,
    echo: false,
    stability: false,
    similarity: false,
  });

  const firstSel = selected.size ? [...selected][0] : null;
  const [text, setText] = useState(
    (firstSel != null ? rows[firstSel]?.text : rows[0]?.text) || ""
  );

  const [voiceQuery, setVoiceQuery] = useState("");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("favorite_voices");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [previewing, setPreviewing] = useState(false);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const noiseJob = useJob();
  const refUpload = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const toggle = (k: FieldKey) => setEnabled((p) => ({ ...p, [k]: !p[k] }));

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("favorite_voices", JSON.stringify([...next]));
      return next;
    });
  };

  const buildPatch = (): Partial<Subtitle> => {
    const patch: Partial<Subtitle> = {};
    if (enabled.voice) patch.voice = voice;
    if (enabled.emotion) patch.emotion = emotion;
    if (enabled.pitch) patch.pitch = pitch;
    if (enabled.speed) patch.speed = speed;
    if (enabled.volume) patch.volume = volume;
    if (enabled.echo) patch.echo = echo;
    if (enabled.stability) patch.stability = stability;
    if (enabled.similarity) patch.similarity = similarity;
    return patch;
  };

  const apply = (target: "selected" | "all") => onApply(buildPatch(), target);

  const preview = async (targetVoiceId?: string) => {
    const activeVoice = targetVoiceId ?? voice;
    const sample = text.trim() || "សួស្តី This is a voice preview.";
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    
    if (targetVoiceId) {
      setActivePreviewId(targetVoiceId);
    } else {
      setPreviewing(true);
    }

    try {
      const res = await fetch(api.ttsPreviewUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sample,
          voice: activeVoice,
          speed,
          reference_wav: refWav.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      setAudioUrl(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (e) {
      notify(`Preview failed: ${String(e).split("\n")[0]}`, "error");
    } finally {
      setPreviewing(false);
      setActivePreviewId(null);
    }
  };

  const uploadReference = async (file: File) => {
    try {
      const res = await api.uploadMedia(file);
      setRefWav(res.path);
      notify(`Reference clip uploaded: ${res.name}`, "success");
    } catch (e) {
      notify(`Upload failed: ${String(e).split("\n")[0]}`, "error");
    }
  };

  const runNoiseReduction = async () => {
    if (!videoPath) return notify("Load a video first", "warning");
    const out = `${videoPath.replace(/\.[^.]+$/, "")}_denoised.wav`;
    const final = await noiseJob.start(() => api.reduceNoise(videoPath, out));
    if (final.status === "done") {
      notify(`Noise reduced → ${out}`, "success");
    } else {
      notify(`Noise reduction failed: ${final.error?.split("\n")[0] || ""}`, "error");
    }
  };

  // Filtered voice catalog
  const filteredVoices = useMemo(() => {
    return voices.filter((v: Voice) => {
      const matchesQuery = v.label.toLowerCase().includes(voiceQuery.toLowerCase()) || v.engine.toLowerCase().includes(voiceQuery.toLowerCase());
      const matchesFav = !showFavsOnly || favorites.has(v.id);
      return matchesQuery && matchesFav;
    });
  }, [voices, voiceQuery, showFavsOnly, favorites]);

  const busy = noiseJob.running;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="panel w-[900px] max-w-full max-h-[92vh] flex flex-col shadow-2xl border border-border/80 bg-bg-panel/95 rounded-xl">
        {/* header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/15 to-transparent shrink-0">
          <div>
            <h2 className="text-sm font-bold text-txt flex items-center gap-1.5">🎙 Voice Studio</h2>
            <p className="text-[10px] text-txt-faint uppercase font-bold mt-0.5">
              Design custom TTS voices, manage favorites, preview parameters, and apply filters
            </p>
          </div>
          <button
            className="text-txt-faint hover:text-txt text-lg transition-colors"
            onClick={onClose}
            disabled={busy}
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 gap-0 min-h-0">
          {/* left: text + preview + clone + noise */}
          <div className="p-5 space-y-4 border-r border-border/40 overflow-y-auto">
            <div>
              <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide mb-1 block">Preview text</label>
              <textarea
                className="input w-full h-24 resize-none text-xs bg-bg-elevated/40"
                placeholder="Type text to hear this voice…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                className="btn-primary flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5"
                onClick={() => preview()}
                disabled={previewing}
              >
                {previewing ? (
                  <>
                    <Spinner size={10} className="text-white" />
                    <span>Synthesizing…</span>
                  </>
                ) : (
                  <>
                    <Icon name="mic" size={12} />
                    <span>▶ Preview Active Parameters</span>
                  </>
                )}
              </button>
              {audioUrl && (
                <audio
                  controls
                  src={audioUrl}
                  className="h-8 max-w-[160px]"
                />
              )}
            </div>

            {/* Voice clone */}
            <div className="panel p-3.5 space-y-2.5 bg-bg/25">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-txt uppercase tracking-wide">🧬 Voice Clone Reference</span>
                {refWav && (
                  <button
                    className="text-[10px] text-txt-faint hover:text-danger font-bold uppercase transition-colors"
                    onClick={() => setRefWav("")}
                  >
                    clear
                  </button>
                )}
              </div>
              <p className="text-[10px] text-txt-faint">
                Upload or select a reference WAV/MP3 to clone its voice in the preview synthesizer.
              </p>
              <input
                className="input w-full font-mono text-[10px]"
                placeholder="reference_voices/sample.wav"
                value={refWav}
                onChange={(e) => setRefWav(e.target.value)}
              />
              <input
                ref={refUpload}
                type="file"
                accept="audio/*,.wav,.mp3"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadReference(f);
                  e.target.value = "";
                }}
              />
              <button
                className="btn-ghost text-[10px] py-1.5 w-full rounded border border-border/50 hover:bg-bg-hover"
                onClick={() => refUpload.current?.click()}
              >
                Upload reference clip…
              </button>
            </div>

            {/* Noise reduction */}
            <div className="panel p-3.5 space-y-2.5 bg-bg/25">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-txt uppercase tracking-wide">🔇 Background Noise Reduction</span>
                {noiseJob.running && (
                  <span className="text-[10px] font-bold text-accent">
                    {noiseJob.job?.progress ?? 0}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-txt-faint">
                Remove environment background noise from the loaded project video audio track.
              </p>
              <button
                className="btn-ghost text-[10px] py-1.5 w-full rounded border border-border/50 hover:bg-bg-hover"
                onClick={runNoiseReduction}
                disabled={busy || !videoPath}
              >
                {noiseJob.running
                  ? noiseJob.job?.message || "Running DSP filter…"
                  : "Run Noise Reduction"}
              </button>
            </div>
          </div>

          {/* right: voice catalog search + favorites + attributes */}
          <div className="p-5 space-y-4 overflow-y-auto">
            
            {/* Voice catalog list */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={enabled.voice}
                    onChange={() => toggle("voice")}
                  />
                  <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Voice Catalog</label>
                </div>
                <div className="flex gap-1.5">
                  <button
                    className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-all ${
                      !showFavsOnly ? "bg-accent/25 text-accent border border-accent/40" : "bg-bg-elevated/40 text-txt-faint"
                    }`}
                    onClick={() => setShowFavsOnly(false)}
                  >
                    All
                  </button>
                  <button
                    className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-all ${
                      showFavsOnly ? "bg-accent/25 text-accent border border-accent/40" : "bg-bg-elevated/40 text-txt-faint"
                    }`}
                    onClick={() => setShowFavsOnly(true)}
                  >
                    ⭐ Favorites ({favorites.size})
                  </button>
                </div>
              </div>

              {/* Search input for voice catalog */}
              <input
                className="input w-full py-1.5 text-xs mb-2 bg-bg-elevated/40 rounded-lg placeholder:text-txt-faint"
                placeholder="Search voices by name / language / engine…"
                value={voiceQuery}
                onChange={(e) => setVoiceQuery(e.target.value)}
              />

              {/* catalog list viewport */}
              <div className="max-h-36 overflow-y-auto border border-border/40 rounded-lg bg-bg/15 space-y-0.5 p-1.5">
                {filteredVoices.map((v: Voice) => (
                  <div
                    key={v.id}
                    onClick={() => {
                      setVoice(v.id);
                      setEnabled((p) => ({ ...p, voice: true }));
                    }}
                    className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-all ${
                      voice === v.id ? "bg-accent/15 border-l-2 border-accent font-semibold" : "hover:bg-bg-hover/20"
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      <button
                        className="text-[10px] text-txt-faint hover:text-warning shrink-0"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(v.id); }}
                      >
                        {favorites.has(v.id) ? "⭐" : "☆"}
                      </button>
                      <div className="truncate">
                        <div className="text-[11px] text-txt truncate">{v.label}</div>
                        <div className="text-[9px] text-txt-faint font-mono uppercase">{v.engine} · {v.id}</div>
                      </div>
                    </div>
                    <button
                      className="text-[9px] px-2 py-0.5 bg-bg-elevated/60 text-txt-muted hover:text-txt hover:bg-accent/25 rounded border border-border/40 shrink-0 font-semibold transition-all"
                      onClick={(e) => { e.stopPropagation(); preview(v.id); }}
                      disabled={activePreviewId !== null}
                    >
                      {activePreviewId === v.id ? "⌛" : "▶ Sample"}
                    </button>
                  </div>
                ))}
                {filteredVoices.length === 0 && (
                  <div className="text-center py-6 text-[10px] text-txt-faint italic">
                    No matching voices in this catalog
                  </div>
                )}
              </div>
            </div>

            {/* Emotion */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={enabled.emotion}
                  onChange={() => toggle("emotion")}
                />
                <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Emotion</label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EMOTIONS.map((em) => (
                  <button
                    key={em}
                    onClick={() => {
                      setEmotion(em);
                      setEnabled((p) => ({ ...p, emotion: true }));
                    }}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                      emotion === em
                        ? "bg-accent text-white border-accent"
                        : "border-border text-txt-muted hover:text-txt hover:border-accent/50"
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {/* Pitch & Speed & Volume sliders */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <ParamSlider
                label="Pitch"
                unit="Hz"
                on={enabled.pitch}
                onToggle={() => toggle("pitch")}
                value={pitch}
                min={-100}
                max={100}
                step={5}
                onChange={setPitch}
              />
              <ParamSlider
                label="Speed"
                unit="×"
                on={enabled.speed}
                onToggle={() => toggle("speed")}
                value={speed}
                min={0.5}
                max={3}
                step={0.05}
                decimals={2}
                onChange={setSpeed}
              />
              <ParamSlider
                label="Volume"
                unit="%"
                on={enabled.volume}
                onToggle={() => toggle("volume")}
                value={volume}
                min={0}
                max={150}
                step={5}
                onChange={setVolume}
              />
              <ParamSlider
                label="Echo"
                unit="%"
                on={enabled.echo}
                onToggle={() => toggle("echo")}
                value={echo}
                min={0}
                max={100}
                step={1}
                onChange={setEcho}
              />
              <ParamSlider
                label="Stability"
                unit="%"
                on={enabled.stability}
                onToggle={() => toggle("stability")}
                value={stability}
                min={0}
                max={100}
                step={1}
                onChange={(val: number) => setStability(val)}
              />
              <ParamSlider
                label="Similarity"
                unit="%"
                on={enabled.similarity}
                onToggle={() => toggle("similarity")}
                value={similarity}
                min={0}
                max={100}
                step={1}
                onChange={(val: number) => setSimilarity(val)}
              />
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0 bg-bg/25 text-xs">
          <span className="text-[10px] text-txt-faint font-semibold uppercase">
            Active:{" "}
            {Object.entries(enabled)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ") || "none"}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost px-4 py-1.5 rounded border border-border/60 text-xs hover:bg-bg-hover" onClick={onClose} disabled={busy}>
              Close
            </button>
            <button
              className="btn-ghost px-4 py-1.5 rounded border border-border/60 text-xs hover:bg-bg-hover"
              onClick={() => apply("selected")}
              disabled={busy || selected.size === 0}
            >
              Apply to Selected ({selected.size})
            </button>
            <button
              className="btn-primary px-4 py-1.5 rounded text-xs font-semibold"
              onClick={() => apply("all")}
              disabled={busy || rows.length === 0}
            >
              Apply to All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ParamSlider({
  label,
  unit,
  on,
  onToggle,
  value,
  min,
  max,
  step,
  decimals = 0,
  onChange,
}: {
  label: string;
  unit: string;
  on: boolean;
  onToggle: () => void;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="p-2 rounded-lg bg-bg-elevated/20 border border-border/25">
      <div className="flex items-center gap-2 mb-1">
        <input type="checkbox" className="accent-accent" checked={on} onChange={onToggle} />
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide flex-1">{label}</label>
        <span className="text-[10px] font-mono text-txt-faint font-bold tabular-nums">
          {value.toFixed(decimals)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-accent h-1 bg-border/40 rounded-lg appearance-none cursor-pointer"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
