import { useRef } from "react";
import Tooltip from "./Tooltip";
import Icon, { type IconName } from "./Icon";

interface Props {
  onLoadVideo: (file: File) => void;
  onImportSrt: (content: string) => void;
  onExportSrt: () => void;
  onExportMp3: () => void;
  onOpenExportCenter: () => void;
  busy: boolean;
}

function TBtn({
  label,
  icon,
  onClick,
  disabled,
  primary,
  className = "",
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <Tooltip label={label}>
      <button
        className={`inline-flex items-center gap-2 rounded-xl px-3.5 h-9 text-xs font-semibold
          transition-all duration-200 active:scale-[0.95]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60
          disabled:opacity-25 disabled:cursor-not-allowed disabled:transform-none disabled:active:scale-100
          ${
            primary
              ? "bg-gradient-to-r from-accent to-[#7c3aed] text-white shadow-md hover:shadow-accent/25 hover:-translate-y-[1px] border border-white/10"
              : "text-txt-muted hover:text-txt bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/10"
          } ${className}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <Icon name={icon} size={14} className="transition-transform duration-200 group-hover:scale-105" />
        <span className="hidden xl:inline">{label}</span>
      </button>
    </Tooltip>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border/60 mx-1.5 shrink-0" />;
}

export default function Toolbar({
  onLoadVideo,
  onImportSrt,
  onExportSrt,
  onExportMp3,
  onOpenExportCenter,
  busy,
}: Props) {
  const videoInput = useRef<HTMLInputElement>(null);
  const srtInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2 px-4 h-14 bg-bg-panel/60 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-30 shrink-0 overflow-x-auto select-none shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <span className="flex items-center gap-2.5 px-1 mr-2 shrink-0">
        <span className="text-accent drop-shadow-[0_0_12px_rgba(99,102,241,0.65)] bg-gradient-to-tr from-accent to-[#7c3aed] p-1.5 rounded-lg text-white">
          <Icon name="music" size={16} />
        </span>
        <span className="text-sm font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-[#f3f4f6] to-[#9ca3af] whitespace-nowrap hidden md:inline">
          AI Video Dubber
        </span>
      </span>

      <Divider />

      <input
        id="toolbar-video-input"
        ref={videoInput}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onLoadVideo(f);
          e.target.value = "";
        }}
      />
      <input
        id="toolbar-srt-input"
        ref={srtInput}
        type="file"
        accept=".srt,.txt"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onImportSrt(await f.text());
          e.target.value = "";
        }}
      />

      <TBtn label="Load Video" icon="video" onClick={() => videoInput.current?.click()} disabled={busy} />
      <TBtn label="Import SRT" icon="srt" onClick={() => srtInput.current?.click()} disabled={busy} />
      <TBtn label="Export SRT" icon="download" onClick={onExportSrt} disabled={busy} />

      <TBtn label="Export MP3" icon="music" onClick={onExportMp3} disabled={busy} primary className="ml-auto" />
      <TBtn label="Export Video" icon="video" onClick={onOpenExportCenter} disabled={busy} primary className="ml-1" />
    </div>
  );
}
