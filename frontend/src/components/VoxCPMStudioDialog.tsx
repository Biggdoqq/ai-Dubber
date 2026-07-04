import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Voice } from "../api/types";

interface Props {
  onClose: () => void;
  notify: (msg: string) => void;
}

export default function VoxCPMStudioDialog({ onClose, notify }: Props) {
  const [voxVoices, setVoxVoices] = useState<Voice[]>([]);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(1.0);
  const [refWav, setRefWav] = useState("");
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    api
      .voices()
      .then((v) => {
        setVoxVoices(v.voxcpm);
        if (v.voxcpm[0]) setVoice(v.voxcpm[0].id);
      })
      .catch(() => {});
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    if (!text.trim()) return notify("Enter some text to speak");
    setGenerating(true);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    try {
      const res = await fetch(api.ttsPreviewUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice,
          speed,
          reference_wav: refWav.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      setAudioUrl(url);
      new Audio(url).play();
      notify("Voice generated");
    } catch (e) {
      notify(`Generation failed: ${String(e).split("\n")[0]}`);
    } finally {
      setGenerating(false);
    }
  };

  const download = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = "voxcpm_output.wav";
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="panel w-[600px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-txt">VoxCPM Voice Studio</h2>
            <p className="text-xs text-txt-faint">High-quality Khmer neural TTS / voice cloning</p>
          </div>
          <button className="text-txt-muted hover:text-txt" onClick={onClose} disabled={generating}>
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-auto flex-1">
          <div>
            <label className="label block mb-1">Text</label>
            <textarea
              className="input w-full h-28 resize-none"
              placeholder="បញ្ចូលអត្ថបទដើម្បីបំប្លែងទៅជាសំឡេង…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1">Voice preset</label>
              <select className="input w-full" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {voxVoices.length === 0 && <option value="">(no VoxCPM voices)</option>}
                {voxVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Speed ({speed.toFixed(2)}×)</label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>

          <div>
            <label className="label block mb-1">Reference WAV for cloning (optional, server path)</label>
            <input
              className="input w-full font-mono text-xs"
              placeholder="reference_voices/sample.wav"
              value={refWav}
              onChange={(e) => setRefWav(e.target.value)}
            />
          </div>

          <p className="text-xs text-txt-faint">
            Reuses the existing TTS endpoint (VoxCPM worker, unchanged). Offline VoxCPM requires the
            <span className="font-mono"> voxcpm</span> package and the ~4.7 GB model to be present in the runtime;
            without them, generation will report a worker error.
          </p>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <button
            className="btn-ghost"
            onClick={download}
            disabled={!audioUrl || generating}
            title={audioUrl ? "Download the generated WAV" : "Generate first"}
          >
            Download WAV
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose} disabled={generating}>
              Close
            </button>
            <button className="btn-primary" onClick={generate} disabled={generating}>
              {generating ? "Generating…" : "Generate Voice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
