import { useState, useEffect } from "react";

interface RecentFile {
  path: string;
  name: string;
  count: number;
  time: number;
}

interface Props {
  onLoadVideo: () => void;
  onImportSrt: () => void;
  onOpenProject: () => void;
  recentFiles?: RecentFile[];
}

const steps = [
  {
    num: "01",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.5"/>
        <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
      </svg>
    ),
    title: "Load Video",
    desc: "MP4, MKV, AVI, MOV, WebM",
    color: "#6366f1",
    glow: "rgba(99,102,241,0.3)",
  },
  {
    num: "02",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
      </svg>
    ),
    title: "Transcribe",
    desc: "AI Speech-to-Text (Whisper)",
    color: "#8b5cf6",
    glow: "rgba(139,92,246,0.3)",
  },
  {
    num: "03",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    title: "Translate",
    desc: "50+ languages supported",
    color: "#06b6d4",
    glow: "rgba(6,182,212,0.3)",
  },
  {
    num: "04",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    ),
    title: "Dub & Export",
    desc: "MP3, MP4 with AI voices",
    color: "#10b981",
    glow: "rgba(16,185,129,0.3)",
  },
];

export default function WelcomeScreen({ onLoadVideo, onImportSrt, onOpenProject, recentFiles = [] }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center min-h-0 overflow-y-auto px-6 py-8"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      {/* ── Hero ── */}
      <div className="flex flex-col items-center mb-10">
        {/* Logo mark */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{
            background: "linear-gradient(135deg, #6366f1, #7c3aed, #4f46e5)",
            boxShadow: "0 0 60px rgba(99,102,241,0.4), 0 16px 40px rgba(0,0,0,0.5)",
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
        </div>

        <h1
          className="text-3xl font-extrabold tracking-tight text-center mb-2"
          style={{
            background: "linear-gradient(135deg, #f9fafb, #c7d2fe, #a5b4fc)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          AI Video Dubber Pro
        </h1>
        <p className="text-[13px] text-center max-w-xs" style={{ color: "#6b7280" }}>
          Transcribe, translate, and dub any video with AI-powered voices
        </p>
      </div>

      {/* ── Steps ── */}
      <div className="flex items-start gap-3 mb-10 flex-wrap justify-center">
        {steps.map((step, i) => (
          <div key={step.num} className="flex items-start gap-2">
            {/* Step card */}
            <div
              className="flex flex-col items-center gap-2 px-4 py-3.5 rounded-xl text-center"
              style={{
                width: 120,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: `0 0 20px ${step.glow}`,
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: `${step.color}22`,
                  border: `1px solid ${step.color}44`,
                  color: step.color,
                }}
              >
                {step.icon}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: step.color + "99" }}>
                Step {step.num}
              </span>
              <span className="text-[12px] font-bold" style={{ color: "#e5e7eb" }}>{step.title}</span>
              <span className="text-[10px]" style={{ color: "#6b7280" }}>{step.desc}</span>
            </div>
            {/* Arrow */}
            {i < steps.length - 1 && (
              <svg
                width="16" height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="2"
                strokeLinecap="round"
                className="mt-6 shrink-0"
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            )}
          </div>
        ))}
      </div>

      {/* ── Action buttons ── */}
      <div className="flex items-center gap-3 mb-8 flex-wrap justify-center">
        <button
          onClick={onLoadVideo}
          className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-[13px] font-bold text-white transition-all duration-150 hover:-translate-y-[2px] active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg, #6366f1, #7c3aed)",
            boxShadow: "0 8px 24px rgba(99,102,241,0.45)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.5"/>
            <polygon points="10 8 16 12 10 16 10 8" fill="white" stroke="none"/>
          </svg>
          Load Video
        </button>

        <button
          onClick={onImportSrt}
          className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-[13px] font-semibold transition-all duration-150 hover:-translate-y-[1px] hover:bg-white/[0.07] active:scale-[0.97]"
          style={{
            color: "#9ca3af",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Import SRT
        </button>

        <button
          onClick={onOpenProject}
          className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-[13px] font-semibold transition-all duration-150 hover:-translate-y-[1px] hover:bg-white/[0.07] active:scale-[0.97]"
          style={{
            color: "#9ca3af",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Open Project
        </button>
      </div>

      {/* ── Recent files ── */}
      {recentFiles.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2 px-1" style={{ color: "#4b5563" }}>
            Recent Projects
          </p>
          <div className="flex flex-col gap-1">
            {recentFiles.slice(0, 4).map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 hover:bg-white/[0.04] cursor-pointer group"
                style={{ border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate" style={{ color: "#e5e7eb" }}>{f.name}</p>
                  <p className="text-[10px] truncate" style={{ color: "#4b5563" }}>{f.path}</p>
                </div>
                <span className="text-[10px] font-mono shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#6366f1" }}>
                  {f.count} rows
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tip ── */}
      <p className="text-[10px] mt-6" style={{ color: "#374151" }}>
        💡 Tip: Drag & drop a video file anywhere to load it instantly
      </p>
    </div>
  );
}
