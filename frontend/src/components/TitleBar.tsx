import { useEffect, useRef, useState } from "react";
import Tooltip from "./Tooltip";
import Icon, { type IconName } from "./Icon";

// ─── Electron type shim (safe — undefined in browser) ────────────────────────
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => boolean;
      onMaximizedChange: (cb: (v: boolean) => void) => void;
      onUpdateAvailable: (cb: (version: string) => void) => void;
      onUpdateDownloaded: (cb: () => void) => void;
      installUpdate: () => void;
    };
  }
}

// ─── Electron window control buttons ─────────────────────────────────────────
function WindowControls() {
  const api = window.electronAPI;
  const [maximized, setMaximized] = useState(() => api?.isMaximized() ?? false);

  useEffect(() => {
    api?.onMaximizedChange(setMaximized);
  }, [api]);

  if (!api?.isElectron) return null;

  return (
    <div
      className="flex items-center shrink-0 h-full"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {/* Minimize */}
      <button
        id="win-btn-minimize"
        aria-label="Minimize"
        onClick={api.minimize}
        className="flex items-center justify-center w-11 h-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-150"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>

      {/* Maximize / Restore */}
      <button
        id="win-btn-maximize"
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={api.maximize}
        className="flex items-center justify-center w-11 h-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-150"
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2" y="0" width="8" height="8" />
            <path d="M0 2v8h8" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0" y="0" width="10" height="10" />
          </svg>
        )}
      </button>

      {/* Close */}
      <button
        id="win-btn-close"
        aria-label="Close"
        onClick={api.close}
        className="flex items-center justify-center w-11 h-full text-white/50 hover:text-white hover:bg-[#e81123] transition-colors duration-150"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <line x1="0" y1="0" x2="10" y2="10" />
          <line x1="10" y1="0" x2="0" y2="10" />
        </svg>
      </button>
    </div>
  );
}

// ─── Auto-update banner ───────────────────────────────────────────────────────
function UpdateBanner() {
  const api = window.electronAPI;
  const [updateVer, setUpdateVer]           = useState<string | null>(null);
  const [downloaded, setDownloaded]         = useState(false);
  const [dismissed, setDismissed]           = useState(false);

  useEffect(() => {
    api?.onUpdateAvailable((v) => setUpdateVer(v));
    api?.onUpdateDownloaded(() => setDownloaded(true));
  }, [api]);

  if (!api?.isElectron || !updateVer || dismissed) return null;

  return (
    <div
      className="fixed top-12 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2 rounded-xl text-[12px] font-medium shadow-2xl animate-fade-in"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.95), rgba(124,58,237,0.95))",
        border: "1px solid rgba(255,255,255,0.15)",
        backdropFilter: "blur(16px)",
      }}
    >
      <span className="text-white">
        {downloaded
          ? `✅ Update v${updateVer} ready — restart to install`
          : `⬇️ Downloading update v${updateVer}…`}
      </span>
      {downloaded && (
        <button
          onClick={api.installUpdate}
          className="px-3 py-1 rounded-lg bg-white text-purple-700 font-bold hover:bg-white/90 transition-colors"
        >
          Restart Now
        </button>
      )}
      <button onClick={() => setDismissed(true)} className="text-white/60 hover:text-white ml-1">✕</button>
    </div>
  );
}

// ─── Menu types ──────────────────────────────────────────────────────────────
export interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
  hint?: string;
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

// ─── Toolbar button ───────────────────────────────────────────────────────────
function TBtn({
  label,
  icon,
  onClick,
  disabled,
  primary,
  danger,
  className = "",
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <Tooltip label={label}>
      <button
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-7 text-[11px] font-semibold shrink-0
          transition-all duration-150 active:scale-[0.95]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60
          disabled:opacity-25 disabled:cursor-not-allowed disabled:transform-none disabled:active:scale-100
          ${
            primary
              ? "bg-gradient-to-r from-accent to-[#7c3aed] text-white shadow-sm hover:shadow-accent/30 hover:-translate-y-[1px] border border-white/10"
              : danger
              ? "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/20 hover:-translate-y-[1px]"
              : "text-txt-muted hover:text-txt bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/10 hover:-translate-y-[1px]"
          } ${className}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <Icon name={icon} size={13} />
        <span className="hidden xl:inline whitespace-nowrap">{label}</span>
      </button>
    </Tooltip>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-white/[0.07] mx-1 shrink-0" />;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  menus: Menu[];
  onLoadVideo: (file: File) => void;
  onImportSrt: (content: string) => void;
  onExportSrt: () => void;
  onExportMp3: () => void;
  onOpenExportCenter: () => void;
  busy: boolean;
}

// ─── TitleBar ─────────────────────────────────────────────────────────────────
export default function TitleBar({
  menus,
  onLoadVideo,
  onImportSrt,
  onExportSrt,
  onExportMp3,
  onOpenExportCenter,
  busy,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const srtInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <>
    <UpdateBanner />
    <header
      className="flex items-center h-12 shrink-0 select-none relative"
      style={{
        background: "rgba(8, 9, 16, 0.92)",
        backdropFilter: "blur(32px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.5)",
        zIndex: 500,
        WebkitAppRegion: "drag",  /* entire bar is draggable */
      } as React.CSSProperties}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-2.5 px-4 shrink-0"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <span
          className="flex items-center justify-center w-7 h-7 rounded-lg text-white shrink-0"
          style={{
            background: "linear-gradient(135deg, #6366f1, #7c3aed)",
            boxShadow: "0 0 14px rgba(99,102,241,0.55)",
          }}
        >
          <Icon name="music" size={14} />
        </span>
        <span
          className="text-[13px] font-extrabold tracking-tight whitespace-nowrap hidden sm:inline"
          style={{
            background: "linear-gradient(90deg, #f3f4f6, #9ca3af)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          AI Video Dubber
        </span>
      </div>

      {/* ── Vertical separator ── */}
      <div className="w-px h-5 bg-white/[0.07] mx-1 shrink-0" />

      {/* ── Menu items ── */}
      <div
        ref={menuRef}
        className="flex items-center shrink-0"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {menus.map((menu) => {
          const isOpen = open === menu.label;
          return (
            <div key={menu.label} className="relative flex items-center">
              <button
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-150
                  ${isOpen
                    ? "bg-white/[0.1] text-white"
                    : "text-txt-muted hover:text-txt hover:bg-white/[0.05]"
                  }`}
                onClick={() => setOpen(isOpen ? null : menu.label)}
                onMouseEnter={() => open && setOpen(menu.label)}
              >
                {menu.label}
              </button>

              {isOpen && (
                <div
                  className="absolute left-0 top-full mt-1.5 p-1.5 rounded-xl animate-scale-in"
                  style={{
                    minWidth: 230,
                    zIndex: 9999,
                    background: "rgba(10, 11, 20, 0.98)",
                    backdropFilter: "blur(32px)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    boxShadow: "0 24px 64px -8px rgba(0,0,0,0.95), 0 0 0 0.5px rgba(255,255,255,0.04)",
                  }}
                >
                  {menu.items.map((item, i) =>
                    item.separator ? (
                      <div key={i} className="my-1 border-t border-white/[0.05]" />
                    ) : (
                      <button
                        key={i}
                        disabled={item.disabled}
                        title={item.hint}
                        onClick={() => {
                          setOpen(null);
                          item.onClick?.();
                        }}
                        className="w-full flex items-center justify-between gap-6 px-3 py-1.5 rounded-lg
                          text-[11px] text-left text-txt-muted hover:text-white hover:bg-accent/15
                          disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-txt-muted
                          transition-all duration-100"
                      >
                        <span className="font-medium">{item.label}</span>
                        {item.shortcut && (
                          <span className="text-[9px] text-txt-faint font-mono bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded shrink-0">
                            {item.shortcut}
                          </span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Hidden file inputs ── */}
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

      {/* ── Toolbar buttons ── */}
      <div className="flex items-center gap-1.5 px-3 shrink-0">
        <TBtn label="Load Video" icon="video" onClick={() => videoInput.current?.click()} disabled={busy} />
        <TBtn label="Import SRT" icon="srt" onClick={() => srtInput.current?.click()} disabled={busy} />
        <TBtn label="Export SRT" icon="download" onClick={onExportSrt} disabled={busy} />
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Export actions (right) ── */}
      <div
        className="flex items-center gap-1.5 px-2 shrink-0"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Divider />
        <TBtn label="Export MP3" icon="music" onClick={onExportMp3} disabled={busy} primary />
        <TBtn label="Export Video" icon="video" onClick={onOpenExportCenter} disabled={busy} primary />
      </div>

      {/* ── Electron window controls (right-most) ── */}
      <WindowControls />
    </header>
    </>
  );
}
