import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { fmtClock } from "../lib/format";
import Icon from "./Icon";
import Spinner from "./Spinner";

interface Props {
  videoPath: string | null;
  currentTime: number;
  onTimeUpdate: (t: number) => void;
  onDuration: (d: number) => void;
  seekTo: number | null;
}

export default function VideoPlayer({
  videoPath,
  onTimeUpdate,
  onDuration,
  seekTo,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const [vol, setVol] = useState(100);
  const [buffering, setBuffering] = useState(false);
  const [hoveringSeek, setHoveringSeek] = useState(false);

  useEffect(() => {
    if (seekTo != null && ref.current) ref.current.currentTime = seekTo;
  }, [seekTo]);

  useEffect(() => {
    if (ref.current) ref.current.volume = vol / 100;
  }, [vol]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const progress = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0 relative" style={{ background: "rgba(6,7,13,0.6)" }}>

      {/* ── Video screen ── */}
      <div className="flex-1 flex items-center justify-center min-h-0 relative overflow-hidden" style={{ background: "#000" }}>
        {videoPath ? (
          <>
            <video
              ref={ref}
              className="max-h-full max-w-full"
              style={{ borderRadius: 4 }}
              src={api.streamUrl(videoPath)}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setCur(t);
                onTimeUpdate(t);
              }}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                setDur(d);
                onDuration(d);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onWaiting={() => setBuffering(true)}
              onPlaying={() => setBuffering(false)}
              onCanPlay={() => setBuffering(false)}
              onSeeked={() => setBuffering(false)}
              onClick={toggle}
            />
            {/* Click-to-play overlay icon */}
            {!playing && !buffering && (
              <button
                onClick={toggle}
                className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200"
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(99,102,241,0.85)",
                    boxShadow: "0 0 32px rgba(99,102,241,0.6)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
              </button>
            )}
          </>
        ) : (
          /* ── Empty State ── */
          <div className="flex flex-col items-center gap-4 px-6 select-none pointer-events-none">
            {/* Animated ring */}
            <div className="relative">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(124,58,237,0.08))",
                  border: "2px dashed rgba(99,102,241,0.25)",
                }}
              >
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="2.5"/>
                  <polygon points="10 8 16 12 10 16 10 8" fill="rgba(99,102,241,0.5)" stroke="none"/>
                </svg>
              </div>
              {/* Pulse ring */}
              <div
                className="absolute inset-0 rounded-2xl animate-ping"
                style={{
                  border: "1px solid rgba(99,102,241,0.2)",
                  animationDuration: "2.5s",
                }}
              />
            </div>

            <div className="text-center space-y-1">
              <p className="text-[13px] font-bold" style={{ color: "#d1d5db" }}>
                Drop a video to get started
              </p>
              <p className="text-[11px]" style={{ color: "#4b5563" }}>
                Supports MP4 · MKV · AVI · MOV · WebM
              </p>
            </div>

            {/* Keyboard hint */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-medium"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#6b7280",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Drag & drop or use the toolbar
            </div>
          </div>
        )}

        {/* Buffering overlay */}
        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}>
            <div
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
              style={{
                background: "rgba(10,11,22,0.9)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            >
              <Spinner size={14} className="text-accent" />
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">Buffering</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Playbar ── */}
      <div
        className="shrink-0 select-none"
        style={{
          padding: "10px 14px 12px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(8,9,18,0.8)",
        }}
      >
        {/* Seek bar */}
        <div
          className="relative h-1.5 rounded-full mb-3 cursor-pointer group"
          style={{ background: "rgba(255,255,255,0.08)" }}
          onMouseEnter={() => setHoveringSeek(true)}
          onMouseLeave={() => setHoveringSeek(false)}
        >
          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #6366f1, #818cf8)",
              boxShadow: "0 0 8px rgba(99,102,241,0.5)",
            }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full transition-all duration-150"
            style={{
              left: `${progress}%`,
              background: "#818cf8",
              boxShadow: "0 0 8px rgba(99,102,241,0.7)",
              opacity: hoveringSeek || playing ? 1 : 0,
              transform: `translateY(-50%) translateX(-50%) scale(${hoveringSeek ? 1.2 : 1})`,
            }}
          />
          {/* Invisible range input */}
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.01}
            value={cur}
            onChange={(e) => {
              const t = parseFloat(e.target.value);
              if (ref.current) ref.current.currentTime = t;
              setCur(t);
            }}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            disabled={!videoPath}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Play + Stop + Time */}
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button
              onClick={toggle}
              disabled={!videoPath}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 active:scale-[0.95] disabled:opacity-30"
              style={{
                background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                boxShadow: videoPath ? "0 4px 12px rgba(99,102,241,0.4)" : "none",
              }}
            >
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
            </button>

            {/* Stop */}
            <button
              onClick={() => {
                if (ref.current) {
                  ref.current.pause();
                  ref.current.currentTime = 0;
                }
                setPlaying(false);
              }}
              disabled={!videoPath}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 active:scale-[0.95] disabled:opacity-30 hover:bg-white/[0.07]"
              style={{
                border: "1px solid rgba(255,255,255,0.07)",
                color: "#9ca3af",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>

            {/* Time code */}
            <span
              className="text-[11px] font-mono font-bold tabular-nums px-2 py-0.5 rounded-lg"
              style={{
                color: "#9ca3af",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {fmtClock(cur)} / {fmtClock(dur)}
            </span>
          </div>

          {/* Right: Volume */}
          <div className="flex items-center gap-2">
            <Icon name="music" size={11} className="text-txt-faint" />
            <div className="relative w-20 h-1.5 rounded-full cursor-pointer" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(vol / 150) * 100}%`,
                  background: "linear-gradient(90deg, #6366f1, #818cf8)",
                }}
              />
              <input
                type="range"
                min={0}
                max={150}
                value={vol}
                onChange={(e) => setVol(parseInt(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                disabled={!videoPath}
              />
            </div>
            <span className="text-[9px] font-bold font-mono tabular-nums" style={{ color: "#6b7280", minWidth: 28 }}>
              {vol}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
