import { useState } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";

interface Props {
  videoPath: string | null;
  onClose: () => void;
  notify: (msg: string) => void;
}

const BLUR_STYLES = [
  "Standard Gaussian",
  "Pixelated Mosaic",
  "Radial Zoom Blur",
  "Motion Blur Horizontal",
  "Motion Blur Vertical",
  "Cyberpunk Glitch Blur",
  "Frosted Slate Glass",
  "Color Tinted Red Blur",
  "Color Tinted Blue Blur",
  "Color Tinted Green Blur",
  "Thermal Heatmap Blur",
];
const KEY_COLORS = ["Green", "Blue", "Black", "White"];
const COLORS = ["White", "Black", "Red", "Yellow", "Cyan", "Green"];
const BG_STYLES = ["None", "Solid Box", "Rounded Box", "Semi-Transparent"];

export default function EffectsOverlaysDialog({ videoPath, onClose, notify }: Props) {
  const [tab, setTab] = useState<"blur" | "watermark" | "text">("blur");

  const [blurOn, setBlurOn] = useState(false);
  const [blur, setBlur] = useState({ x: 0, y: 0, w: 200, h: 100, strength: 15, style: "Standard Gaussian" });

  const [wmOn, setWmOn] = useState(false);
  const [wm, setWm] = useState({
    path: "", x: 20, y: 20, scale: 100, opacity: 100, rotation: 0, green_screen: false, key_color: "Green",
  });

  const [textOn, setTextOn] = useState(false);
  const [text, setText] = useState({
    text: "", size: 50, color: "White", x: 50, y: 50, outline_width: 0, bg_style: "None",
  });

  const job = useJob();
  const [running, setRunning] = useState(false);

  const apply = async () => {
    if (!videoPath) return notify("Load a video first");
    const config: Record<string, unknown> = {
      blur: blurOn ? blur : null,
      watermark: wmOn && wm.path ? wm : null,
      text: textOn && text.text ? text : null,
    };
    if (!config.blur && !config.watermark && !config.text) {
      return notify("Enable at least one overlay (blur, watermark, or text)");
    }
    const out = `${videoPath.replace(/\.[^.]+$/, "")}_overlays.mp4`;
    setRunning(true);
    const final = await job.start(() => api.applyOverlays(videoPath, out, config));
    setRunning(false);
    notify(final.status === "done" ? `Overlays applied → ${out}` : `Overlays failed: ${final.error?.split("\n")[0] || ""}`);
    if (final.status === "done") onClose();
  };

  const num = (v: string) => parseInt(v) || 0;
  const TABS: [typeof tab, string][] = [
    ["blur", "Blur"],
    ["watermark", "Watermark"],
    ["text", "Text"],
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="panel w-[560px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-txt">Video Overlays (Watermark / Blur / Text)</h2>
          <button className="text-txt-muted hover:text-txt" onClick={onClose} disabled={running}>✕</button>
        </div>

        <div className="flex border-b border-border px-2">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                tab === id ? "border-accent text-txt" : "border-transparent text-txt-muted hover:text-txt"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3 overflow-auto flex-1">
          {tab === "blur" && (
            <>
              <label className="flex items-center gap-2 text-sm text-txt">
                <input type="checkbox" className="accent-accent" checked={blurOn} onChange={(e) => setBlurOn(e.target.checked)} />
                Enable blur region
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <div key={k}>
                    <label className="label block mb-1 uppercase">{k}</label>
                    <input type="number" className="input w-full" value={blur[k]} onChange={(e) => setBlur({ ...blur, [k]: num(e.target.value) })} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label block mb-1">Strength</label>
                  <input type="number" min={1} max={99} className="input w-full" value={blur.strength} onChange={(e) => setBlur({ ...blur, strength: num(e.target.value) })} />
                </div>
                <div>
                  <label className="label block mb-1">Style</label>
                  <select className="input w-full" value={blur.style} onChange={(e) => setBlur({ ...blur, style: e.target.value })}>
                    {BLUR_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {tab === "watermark" && (
            <>
              <label className="flex items-center gap-2 text-sm text-txt">
                <input type="checkbox" className="accent-accent" checked={wmOn} onChange={(e) => setWmOn(e.target.checked)} />
                Enable watermark
              </label>
              <div>
                <label className="label block mb-1">Image/Video path (server-side)</label>
                <input className="input w-full font-mono text-xs" placeholder="C:\\path\\to\\logo.png" value={wm.path} onChange={(e) => setWm({ ...wm, path: e.target.value })} />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div><label className="label block mb-1">X</label><input type="number" className="input w-full" value={wm.x} onChange={(e) => setWm({ ...wm, x: num(e.target.value) })} /></div>
                <div><label className="label block mb-1">Y</label><input type="number" className="input w-full" value={wm.y} onChange={(e) => setWm({ ...wm, y: num(e.target.value) })} /></div>
                <div><label className="label block mb-1">Scale%</label><input type="number" className="input w-full" value={wm.scale} onChange={(e) => setWm({ ...wm, scale: num(e.target.value) })} /></div>
                <div><label className="label block mb-1">Opacity%</label><input type="number" min={0} max={100} className="input w-full" value={wm.opacity} onChange={(e) => setWm({ ...wm, opacity: num(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div><label className="label block mb-1">Rotation°</label><input type="number" className="input w-full" value={wm.rotation} onChange={(e) => setWm({ ...wm, rotation: num(e.target.value) })} /></div>
                <label className="flex items-center gap-2 text-sm text-txt pb-2">
                  <input type="checkbox" className="accent-accent" checked={wm.green_screen} onChange={(e) => setWm({ ...wm, green_screen: e.target.checked })} />
                  Chroma key
                </label>
              </div>
              {wm.green_screen && (
                <div>
                  <label className="label block mb-1">Key color</label>
                  <select className="input w-full" value={wm.key_color} onChange={(e) => setWm({ ...wm, key_color: e.target.value })}>
                    {KEY_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {tab === "text" && (
            <>
              <label className="flex items-center gap-2 text-sm text-txt">
                <input type="checkbox" className="accent-accent" checked={textOn} onChange={(e) => setTextOn(e.target.checked)} />
                Enable text overlay
              </label>
              <div>
                <label className="label block mb-1">Text</label>
                <input className="input w-full" value={text.text} onChange={(e) => setText({ ...text, text: e.target.value })} />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div><label className="label block mb-1">Size</label><input type="number" className="input w-full" value={text.size} onChange={(e) => setText({ ...text, size: num(e.target.value) })} /></div>
                <div><label className="label block mb-1">X</label><input type="number" className="input w-full" value={text.x} onChange={(e) => setText({ ...text, x: num(e.target.value) })} /></div>
                <div><label className="label block mb-1">Y</label><input type="number" className="input w-full" value={text.y} onChange={(e) => setText({ ...text, y: num(e.target.value) })} /></div>
                <div><label className="label block mb-1">Outline</label><input type="number" min={0} className="input w-full" value={text.outline_width} onChange={(e) => setText({ ...text, outline_width: num(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label block mb-1">Color</label>
                  <select className="input w-full" value={text.color} onChange={(e) => setText({ ...text, color: e.target.value })}>
                    {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Background</label>
                  <select className="input w-full" value={text.bg_style} onChange={(e) => setText({ ...text, bg_style: e.target.value })}>
                    {BG_STYLES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          <p className="text-xs text-txt-faint pt-2">
            Renders via the legacy video_effects overlay renderer (unchanged). Coordinates are pixels from the top-left of the frame.
          </p>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-txt-muted min-h-[1rem]">
            {running ? `${job.job?.progress ?? 0}% · ${job.job?.message || "Rendering…"}` : ""}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose} disabled={running}>Close</button>
            <button className="btn-primary" onClick={apply} disabled={running || !videoPath}>Apply Overlays</button>
          </div>
        </div>
      </div>
    </div>
  );
}
