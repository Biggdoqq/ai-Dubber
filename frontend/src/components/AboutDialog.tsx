interface Props {
  onClose: () => void;
}

export default function AboutDialog({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-[460px] overflow-hidden animate-scale-in"
        style={{
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "linear-gradient(160deg, rgba(12,13,24,0.98) 0%, rgba(8,9,18,0.99) 100%)",
          boxShadow: "0 32px 80px -12px rgba(0,0,0,0.95), 0 0 0 0.5px rgba(255,255,255,0.04)",
        }}
      >
        {/* Ambient glow top */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 70%)" }}
        />

        {/* Header */}
        <div className="relative flex flex-col items-center pt-10 pb-6 px-8">
          {/* Logo */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-2xl"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #7c3aed 50%, #4f46e5 100%)",
              boxShadow: "0 0 40px rgba(99,102,241,0.5), 0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>

          {/* App name */}
          <h2
            className="text-2xl font-extrabold tracking-tight mb-1"
            style={{
              background: "linear-gradient(135deg, #f3f4f6, #c7d2fe, #a5b4fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            AI Video Dubber Pro
          </h2>

          {/* Version badge */}
          <span
            className="text-[11px] font-bold px-3 py-1 rounded-full mb-4"
            style={{
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.3)",
              color: "#a5b4fc",
            }}
          >
            Version 2.0.0
          </span>

          {/* Description */}
          <p className="text-[13px] text-center leading-relaxed" style={{ color: "#9ca3af" }}>
            AI-powered subtitle transcription, translation,<br />
            and multi-voice dubbing for any video.
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 24px" }} />

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 px-8 py-5">
          {["Whisper STT", "Edge TTS", "Deep Translator", "FastAPI", "React"].map((tech) => (
            <span
              key={tech}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "#9ca3af",
              }}
            >
              {tech}
            </span>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 24px" }} />

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4">
          <span className="text-[11px]" style={{ color: "#4b5563" }}>
            © 2025 — All rights reserved
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-[12px] font-bold text-white transition-all duration-150 hover:-translate-y-[1px] active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, #6366f1, #7c3aed)",
              boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
