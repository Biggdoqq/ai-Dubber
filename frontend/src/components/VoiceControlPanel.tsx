import { useState } from "react";
import { api } from "../api/client";
import type { Subtitle, Voice } from "../api/types";
import VoicePickerDialog from "./VoicePickerDialog";

interface Props {
  voices: Voice[];
  rows: Subtitle[];
  selected: Set<number>;
  onApply: (patch: Partial<Subtitle>, target: "selected" | "all") => void;
  busy: boolean;
}

type FieldKey = "voice" | "pitch" | "speed" | "volume" | "echo" | "emotion" | "gender" | "noise_reduction";

export default function VoiceControlPanel({ voices, rows, selected, onApply, busy }: Props) {
  const [voice, setVoice] = useState("");
  const [pitch, setPitch] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(100);
  const [echo, setEcho] = useState(0);
  const [emotion, setEmotion] = useState("");
  const [gender, setGender] = useState("");
  const [noiseReduction, setNoiseReduction] = useState(false);

  const [enabled, setEnabled] = useState<Record<FieldKey, boolean>>({
    voice: true,
    pitch: false,
    speed: false,
    volume: false,
    echo: false,
    emotion: false,
    gender: false,
    noise_reduction: false,
  });

  const [picker, setPicker] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const toggle = (k: FieldKey) => setEnabled((p) => ({ ...p, [k]: !p[k] }));

  const buildPatch = (): Partial<Subtitle> => {
    const patch: Partial<Subtitle> = {};
    if (enabled.voice) patch.voice = voice;
    if (enabled.pitch) patch.pitch = pitch;
    if (enabled.speed) patch.speed = speed;
    if (enabled.volume) patch.volume = volume;
    if (enabled.echo) patch.echo = echo;
    if (enabled.emotion) patch.emotion = emotion || null;
    if (enabled.gender) patch.gender = gender || null;
    if (enabled.noise_reduction) (patch as any).noise_reduction = noiseReduction;
    return patch;
  };

  const apply = (target: "selected" | "all") => onApply(buildPatch(), target);

  const preview = async () => {
    const sampleText =
      (selected.size ? rows[[...selected][0]]?.text : rows[0]?.text) ||
      "សួស្តី This is a voice preview sample.";
    setPreviewing(true);
    try {
      const res = await fetch(api.ttsPreviewUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sampleText, voice, speed }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      // preview failure is non-fatal
    } finally {
      setPreviewing(false);
    }
  };

  const selVoice = voices.find((v) => v.id === voice);

  return (
    <div className="panel px-5 py-4 flex flex-col gap-3.5">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/5 pb-2.5">
        <span className="text-xs font-bold text-txt flex items-center gap-2">
          <span className="text-accent drop-shadow-[0_0_6px_rgba(99,102,241,0.5)]">🎙️</span> Voice & Synthesis Batch Controls
        </span>
        {selVoice && enabled.voice && (
          <span className="text-[10px] text-txt-faint font-mono bg-white/[0.03] border border-white/5 px-2 py-0.5 rounded-lg">
            {selVoice.engine} · {selVoice.id}
          </span>
        )}
      </div>

      {/* vertical list of parameters */}
      <div className="flex flex-col gap-3 text-xs">
        {/* voice profile */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled.voice}
            onChange={() => toggle("voice")}
            title="Include Voice Profile"
            className="accent-accent w-4 h-4 rounded border-white/5"
          />
          <span className="label w-14 shrink-0">Voice</span>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <select
              className="input py-1.5 text-xs rounded-xl bg-[#0c0d16]/75 flex-1 min-w-0"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={!enabled.voice}
            >
              <option value="" className="bg-bg-panel text-txt">(default)</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id} className="bg-bg-panel text-txt">
                  {v.label}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost p-1.5 border border-white/5 rounded-xl hover:text-accent disabled:opacity-40"
              onClick={() => setPicker(true)}
              disabled={!enabled.voice}
              title="Open full Voice picker"
            >
              🔍
            </button>
          </div>
          <div className="w-16 shrink-0" />
        </div>

        {/* pitch slider */}
        <NumField
          label="Pitch"
          on={enabled.pitch}
          onToggle={() => toggle("pitch")}
          value={pitch}
          step={5}
          min={-100}
          max={100}
          onChange={setPitch}
        />

        {/* speed slider */}
        <NumField
          label="Speed"
          on={enabled.speed}
          onToggle={() => toggle("speed")}
          value={speed}
          step={0.05}
          min={0.5}
          max={3.0}
          onChange={setSpeed}
        />

        {/* volume slider */}
        <NumField
          label="Volume"
          on={enabled.volume}
          onToggle={() => toggle("volume")}
          value={volume}
          step={5}
          min={0}
          max={150}
          onChange={setVolume}
        />

        {/* echo intensity */}
        <NumField
          label="Echo"
          on={enabled.echo}
          onToggle={() => toggle("echo")}
          value={echo}
          step={5}
          min={0}
          max={100}
          onChange={setEcho}
        />

        {/* emotion dropdown/input */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled.emotion}
            onChange={() => toggle("emotion")}
            title="Include Emotion"
            className="accent-accent w-4 h-4 rounded border-white/5"
          />
          <span className="label w-14 shrink-0">Emotion</span>
          <input
            type="text"
            className="input py-1.5 text-xs rounded-xl bg-[#0c0d16]/75 flex-1 min-w-0"
            placeholder="e.g. angry, happy"
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            disabled={!enabled.emotion}
          />
          <div className="w-16 shrink-0" />
        </div>

        {/* gender select */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled.gender}
            onChange={() => toggle("gender")}
            title="Include Gender"
            className="accent-accent w-4 h-4 rounded border-white/5"
          />
          <span className="label w-14 shrink-0">Gender</span>
          <select
            className="input py-1.5 text-xs rounded-xl bg-[#0c0d16]/75 flex-1 min-w-0"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            disabled={!enabled.gender}
          >
            <option value="" className="bg-bg-panel text-txt">—</option>
            <option value="Male" className="bg-bg-panel text-txt">Male</option>
            <option value="Female" className="bg-bg-panel text-txt">Female</option>
            <option value="Unknown" className="bg-bg-panel text-txt">Unknown</option>
          </select>
          <div className="w-16 shrink-0" />
        </div>

        {/* noise reduction filter */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled.noise_reduction}
            onChange={() => toggle("noise_reduction")}
            title="Include Noise Reduction"
            className="accent-accent w-4 h-4 rounded border-white/5"
          />
          <span className="label w-14 shrink-0 text-left">Denoise</span>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="checkbox"
              checked={noiseReduction}
              onChange={(e) => setNoiseReduction(e.target.checked)}
              disabled={!enabled.noise_reduction}
              className="accent-accent w-4 h-4 rounded border-white/5"
            />
            <span className="text-[10px] text-txt-faint truncate">
              {noiseReduction ? "Denoising ON" : "Denoising OFF"}
            </span>
          </div>
          <div className="w-16 shrink-0" />
        </div>
      </div>

      {/* footer buttons */}
      <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-2.5 flex-wrap">
        <button
          className="btn-ghost py-1.5 px-3.5 rounded-xl hover:text-white"
          onClick={preview}
          disabled={previewing || !voice}
          title="Preview the selected voice & speed"
        >
          {previewing ? "Generating…" : "▶ Preview voice"}
        </button>

        <div className="w-px h-4 bg-white/5 mx-1 shrink-0" />

        <button
          className="btn-ghost py-1.5 px-4 text-accent border border-accent/20 hover:bg-accent/10 rounded-xl"
          onClick={() => apply("selected")}
          disabled={busy || selected.size === 0}
          title="Apply selected options to marked rows"
        >
          Apply to Selected ({selected.size})
        </button>

        <button
          className="btn-primary py-1.5 px-4.5 rounded-xl shadow-accent/25 shadow-lg"
          onClick={() => apply("all")}
          disabled={busy || rows.length === 0}
          title="Apply selected options to all rows"
        >
          Apply to All ({rows.length})
        </button>
      </div>

      {picker && (
        <VoicePickerDialog
          voices={voices}
          current={voice}
          previewText={(selected.size ? rows[[...selected][0]]?.text : rows[0]?.text) || ""}
          onSelect={(id) => {
            setVoice(id);
            setEnabled((p) => ({ ...p, voice: true }));
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

function NumField({
  label,
  on,
  onToggle,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={on}
        onChange={onToggle}
        title={`Include ${label} when applying`}
        className="accent-accent w-4 h-4 rounded border-white/5"
      />
      <span className="label w-14 shrink-0">{label}</span>
      <input
        type="number"
        className="input py-1.5 text-xs rounded-xl bg-[#0c0d16]/75 flex-1 min-w-0 text-center tabular-nums"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(step < 1 ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
        disabled={!on}
      />
      <span className="text-[10px] text-txt-faint font-mono w-16 text-right shrink-0">
        [{min}..{max}]
      </span>
    </div>
  );
}
