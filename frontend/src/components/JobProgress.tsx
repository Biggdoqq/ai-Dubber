import type { Job } from "../api/types";
import Spinner from "./Spinner";

interface Props {
  job: Job | null;
  title: string;
  onCancel?: () => void;
}

export default function JobProgress({ job, title, onCancel }: Props) {
  if (!job) return null;
  const pct = job.progress || 0;
  const isError = job.status === "error";
  const isRunning = job.status === "running" || job.status === "pending";
  const isDone = job.status === "done";

  // Determine step label
  const getStep = () => {
    if (isError) return "Error occurred";
    if (isDone) return "Complete!";
    if (pct < 10) return "Preparing…";
    if (pct < 40) return "Processing…";
    if (pct < 80) return "Working…";
    if (pct < 98) return "Finishing up…";
    return "Almost done…";
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }}
    >
      <div
        className="relative w-[480px] p-8 animate-scale-in overflow-hidden"
        style={{
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(10,11,22,0.98)",
          boxShadow: "0 32px 80px -12px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Ambient top glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-24 pointer-events-none"
          style={{
            background: isError
              ? "radial-gradient(ellipse, rgba(239,68,68,0.12) 0%, transparent 70%)"
              : "radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)",
          }}
        />

        {/* Icon + Title */}
        <div className="flex items-center gap-3 mb-6 relative">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: isError
                ? "rgba(239,68,68,0.15)"
                : "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(124,58,237,0.15))",
              border: `1px solid ${isError ? "rgba(239,68,68,0.3)" : "rgba(99,102,241,0.3)"}`,
            }}
          >
            {isRunning ? (
              <Spinner size={18} className="text-accent" />
            ) : isError ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            )}
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-white leading-tight">{title}</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>{getStep()}</p>
          </div>
        </div>

        {/* Message */}
        {job.message && (
          <p
            className="text-[11px] mb-4 truncate px-3 py-2 rounded-lg"
            style={{
              color: isError ? "#f87171" : "#9ca3af",
              background: isError ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${isError ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)"}`,
            }}
          >
            {isError ? job.error?.split("\n")[0] : job.message || job.status}
          </p>
        )}

        {/* Progress track */}
        <div
          className="relative h-2.5 rounded-full overflow-hidden mb-3"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          {/* Animated gradient fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: isError
                ? "linear-gradient(90deg, #ef4444, #be123c)"
                : isDone
                ? "linear-gradient(90deg, #10b981, #059669)"
                : "linear-gradient(90deg, #6366f1, #7c3aed, #a855f7)",
              boxShadow: isError
                ? "0 0 12px rgba(239,68,68,0.5)"
                : isDone
                ? "0 0 12px rgba(16,185,129,0.5)"
                : "0 0 16px rgba(99,102,241,0.6)",
            }}
          />
          {/* Shimmer effect when running */}
          {isRunning && (
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
              }}
            />
          )}
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between mt-1">
          {/* Steps indicator */}
          <div className="flex items-center gap-1.5">
            {["Prepare", "Process", "Finish"].map((step, i) => {
              const stepPct = [0, 40, 80][i];
              const active = pct >= stepPct;
              return (
                <div key={step} className="flex items-center gap-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      background: active ? "#6366f1" : "rgba(255,255,255,0.1)",
                      boxShadow: active ? "0 0 6px rgba(99,102,241,0.7)" : "none",
                    }}
                  />
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider"
                    style={{ color: active ? "#818cf8" : "#374151" }}
                  >
                    {step}
                  </span>
                  {i < 2 && <div style={{ width: 12, height: 1, background: active ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)" }} />}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-[12px] font-bold font-mono tabular-nums"
              style={{ color: isError ? "#ef4444" : isDone ? "#10b981" : "#818cf8" }}
            >
              {pct}%
            </span>
            {onCancel && isRunning && (
              <button
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 hover:bg-white/10 active:scale-[0.97]"
                style={{
                  color: "#9ca3af",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
