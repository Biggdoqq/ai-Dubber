import type { ReactNode } from "react";
import Icon from "./Icon";

interface Props {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export default function Panel({
  title,
  icon,
  children,
  collapsed = false,
  onToggleCollapse,
  onClose,
  actions,
  className = "",
  bodyClassName = "",
}: Props) {
  return (
    <section
      className={`flex flex-col overflow-hidden min-h-0 ${className}`}
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10, 11, 20, 0.55)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <header
        className="flex items-center gap-2 px-3.5 shrink-0 select-none"
        style={{
          height: 36,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(255,255,255,0.015)",
        }}
      >
        {icon && (
          <span
            className="shrink-0"
            style={{ color: "#818cf8", filter: "drop-shadow(0 0 5px rgba(99,102,241,0.4))" }}
          >
            {icon}
          </span>
        )}
        <span className="text-[10px] font-bold uppercase tracking-widest text-txt-muted truncate">
          {title}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {actions}
          {onToggleCollapse && (
            <button
              className="p-1 rounded-md text-txt-faint hover:text-txt hover:bg-white/[0.05] transition-all duration-150"
              onClick={onToggleCollapse}
              title={collapsed ? "Expand" : "Collapse"}
              aria-label={collapsed ? "Expand panel" : "Collapse panel"}
            >
              <svg
                width={11}
                height={11}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              className="p-1 rounded-md text-txt-faint hover:text-txt hover:bg-white/[0.05] transition-all duration-150"
              onClick={onClose}
              title="Close panel"
              aria-label="Close panel"
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
      </header>
      {!collapsed && (
        <div className={`flex-1 min-h-0 overflow-auto ${bodyClassName}`}>
          {children}
        </div>
      )}
    </section>
  );
}
