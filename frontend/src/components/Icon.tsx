interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

export type IconName =
  | "video"
  | "srt"
  | "download"
  | "mic"
  | "gauge"
  | "merge"
  | "tools"
  | "batch"
  | "wrench"
  | "globe"
  | "settings"
  | "music"
  | "close"
  | "check"
  | "warning"
  | "info"
  | "error"
  | "upload"
  | "users"
  | "clock";

// 24x24 stroke icons, currentColor. Kept inline to avoid a new dependency.
const PATHS: Record<IconName, JSX.Element> = {
  video: (
    <>
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="M16 9l6-3v12l-6-3" />
    </>
  ),
  srt: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  download: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />,
  upload: <path d="M12 21V9m0 0l-4 4m4-4l4 4M4 3h16" />,
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  gauge: (
    <>
      <path d="M12 13l4-4" />
      <path d="M3 18a9 9 0 1 1 18 0" />
    </>
  ),
  merge: <path d="M7 20V10l5-5 5 5v10M7 14h10" />,
  tools: <path d="M14 7l3-3 3 3-3 3M3 21l7-7M9 11l4 4" />,
  batch: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.4-2.4 2.3-2.3z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4 12l5 5L20 6" />,
  warning: <path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16h.01" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.5a3.5 3.5 0 0 1 0 5M18 20a6.5 6.5 0 0 0-3-5.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
};

export default function Icon({ name, size = 16, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
