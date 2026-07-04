import { useRef, useState, type ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

const POS: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

export default function Tooltip({ label, children, side = "bottom", delay = 400 }: Props) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = () => {
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`absolute z-[100] whitespace-nowrap rounded-md bg-bg-elevated border border-border
            px-2 py-1 text-xs text-txt shadow-popover pointer-events-none animate-tooltip-in ${POS[side]}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
