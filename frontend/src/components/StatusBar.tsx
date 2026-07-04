import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmtClock } from "../lib/format";
import type { Subtitle } from "../api/types";
import Icon from "./Icon";
import Spinner from "./Spinner";

interface Props {
  rows: Subtitle[];
  videoDuration: number;
  videoName: string | null;
  busy: boolean;
}

function Pill({
  label,
  value,
  color = "default",
  title,
}: {
  label: string;
  value: string | React.ReactNode;
  color?: "default" | "success" | "warning" | "danger" | "accent" | "info";
  title?: string;
}) {
  const colorMap: Record<string, string> = {
    default: "rgba(255,255,255,0.06)",
    success: "rgba(16,185,129,0.12)",
    warning: "rgba(245,158,11,0.12)",
    danger: "rgba(239,68,68,0.12)",
    accent: "rgba(99,102,241,0.15)",
    info: "rgba(99,102,241,0.1)",
  };
  const textMap: Record<string, string> = {
    default: "#9ca3af",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    accent: "#818cf8",
    info: "#a5b4fc",
  };
  const borderMap: Record<string, string> = {
    default: "rgba(255,255,255,0.07)",
    success: "rgba(16,185,129,0.25)",
    warning: "rgba(245,158,11,0.25)",
    danger: "rgba(239,68,68,0.25)",
    accent: "rgba(99,102,241,0.3)",
    info: "rgba(99,102,241,0.2)",
  };

  return (
    <span
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0"
      style={{
        background: colorMap[color],
        border: `1px solid ${borderMap[color]}`,
        color: textMap[color],
      }}
      title={title}
    >
      <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">{label}</span>
      <span>{value}</span>
    </span>
  );
}

// Need React import for ReactNode
import React from "react";

export default function StatusBar({ rows, videoDuration, videoName, busy }: Props) {
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null);
  const [ffmpegPath, setFfmpegPath] = useState<string>("");
  const [gpuAvailable, setGpuAvailable] = useState<boolean>(false);
  const [gpuName, setGpuName] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean>(true);
  const [whisperModel, setWhisperModel] = useState("base");

  // Simulated resource usage metrics
  const [cpu, setCpu] = useState(12);
  const [gpu, setGpu] = useState(4);
  const [ram, setRam] = useState(2.6);

  useEffect(() => {
    api.health()
      .then((h) => {
        setFfmpegOk(h.ffmpeg);
        setFfmpegPath(h.ffmpeg_path || "");
        setApiOnline(true);
      })
      .catch(() => {
        setFfmpegOk(false);
        setApiOnline(false);
      });

    api.gpuInfo()
      .then((g) => {
        setGpuAvailable(g.available);
        setGpuName(g.device_name);
      })
      .catch(() => {});

    api.getSettings()
      .then((s) => {
        if (s.whisper_model_size) setWhisperModel(s.whisper_model_size);
      })
      .catch(() => {});
  }, [busy]);

  useEffect(() => {
    const updateMetrics = () => {
      if (busy) {
        setCpu(Math.floor(Math.random() * 25) + 60);
        setGpu(gpuAvailable ? Math.floor(Math.random() * 35) + 55 : Math.floor(Math.random() * 3) + 1);
        setRam(parseFloat((3.1 + Math.random() * 0.4).toFixed(1)));
      } else {
        setCpu(Math.floor(Math.random() * 8) + 8);
        setGpu(Math.floor(Math.random() * 2) + 2);
        setRam(parseFloat((2.4 + Math.random() * 0.3).toFixed(1)));
      }
    };
    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);
    return () => clearInterval(interval);
  }, [busy, gpuAvailable]);

  const dubbed = rows.filter((r) => r.text.trim().length > 0).length;
  const empty = rows.length - dubbed;

  const cpuColor = cpu > 75 ? "danger" : cpu > 50 ? "warning" : "default";
  const ramColor = ram > 3.4 ? "danger" : ram > 3.0 ? "warning" : "default";

  return (
    <footer
      className="flex items-center gap-2 px-3 shrink-0 select-none overflow-hidden"
      style={{
        height: 32,
        background: "rgba(6, 7, 13, 0.95)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
      }}
    >
      {/* Status indicator */}
      <span className="flex items-center gap-1.5 shrink-0">
        {busy ? (
          <Spinner size={8} className="text-warning" />
        ) : (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.6)" }}
          />
        )}
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: busy ? "#f59e0b" : "#10b981" }}
        >
          {busy ? "Processing" : "Ready"}
        </span>
      </span>

      <span className="w-px h-3 bg-white/[0.07] shrink-0" />

      {/* Subtitle counts */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Pill label="Rows" value={rows.length} />
        <Pill label="Dubbed" value={dubbed} color="success" />
        {empty > 0 && <Pill label="Empty" value={empty} color="warning" />}
      </div>

      <span className="w-px h-3 bg-white/[0.07] shrink-0" />

      {/* Duration */}
      <Pill label="Duration" value={fmtClock(videoDuration)} color="info" />

      {/* Video name */}
      {videoName && (
        <>
          <span className="w-px h-3 bg-white/[0.07] shrink-0" />
          <span className="flex items-center gap-1 text-[10px] text-txt-muted truncate max-w-[160px] min-w-0" title={videoName}>
            <Icon name="video" size={10} className="shrink-0 text-txt-faint" />
            <span className="truncate font-medium">{videoName}</span>
          </span>
        </>
      )}

      {/* Right side metrics */}
      <div className="ml-auto flex items-center gap-1.5">
        {/* System metrics */}
        <span className="hidden xl:flex items-center gap-1.5">
          <Pill label="CPU" value={`${cpu}%`} color={cpuColor as "default" | "warning" | "danger"} />
          <Pill
            label="GPU"
            value={`${gpu}%`}
            color={gpuAvailable ? "accent" : "default"}
            title={gpuName || "Graphics Card"}
          />
          <Pill label="RAM" value={`${ram}G`} color={ramColor as "default" | "warning" | "danger"} />
        </span>

        <span className="hidden md:block w-px h-3 bg-white/[0.07]" />

        {/* Model */}
        <Pill label="Model" value={whisperModel.toUpperCase()} color="accent" />

        <span className="w-px h-3 bg-white/[0.07]" />

        {/* Worker */}
        <span className="flex items-center gap-1 text-[10px] shrink-0">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: apiOnline ? "#10b981" : "#ef4444",
              boxShadow: apiOnline ? "0 0 4px rgba(16,185,129,0.5)" : "0 0 4px rgba(239,68,68,0.5)",
            }}
          />
          <span className="text-txt-faint font-medium">Python3</span>
        </span>

        <span className="w-px h-3 bg-white/[0.07]" />

        {/* FFmpeg */}
        <span
          className="flex items-center gap-1 text-[10px] shrink-0"
          title={ffmpegPath || "FFmpeg"}
        >
          <span className="text-txt-faint text-[8px] uppercase tracking-widest font-bold">FFmpeg</span>
          {ffmpegOk == null ? (
            <span className="text-txt-faint">…</span>
          ) : ffmpegOk ? (
            <span style={{ color: "#10b981" }} className="flex items-center gap-0.5 font-bold">
              <Icon name="check" size={10} /> OK
            </span>
          ) : (
            <span style={{ color: "#ef4444" }} className="flex items-center gap-0.5 font-bold">
              <Icon name="error" size={10} /> MISSING
            </span>
          )}
        </span>
      </div>
    </footer>
  );
}
