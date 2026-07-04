import type { ReactNode } from "react";

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
  badge?: string | number;
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  items: SidebarItem[];
  footerItems?: SidebarItem[];
}

export default function Sidebar({ collapsed, onToggle, items, footerItems }: Props) {
  const width = collapsed ? 52 : 172;

  return (
    <aside
      className="relative flex flex-col shrink-0 h-full"
      style={{
        width,
        minWidth: width,
        transition: "width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)",
        background: "rgba(7,8,14,0.85)",
        backdropFilter: "blur(24px)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        zIndex: 10,
      }}
    >
      {/* Subtle top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)" }}
      />

      {/* Nav items */}
      <nav className="flex-1 flex flex-col py-2 px-1.5 gap-0.5 min-h-0 overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <p className="text-[9px] font-black uppercase tracking-[0.2em] px-2 pt-1.5 pb-1.5 select-none"
            style={{ color: "rgba(99,102,241,0.5)" }}>
            Workspace
          </p>
        )}
        {collapsed && <div className="h-3" />}

        {items.map((item) => (
          <NavItem key={item.id} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer items */}
      {footerItems && footerItems.length > 0 && (
        <div className="flex flex-col px-1.5 py-2 gap-0.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {!collapsed && (
            <p className="text-[9px] font-black uppercase tracking-[0.2em] px-2 pb-1.5 select-none"
              style={{ color: "rgba(255,255,255,0.2)" }}>
              Layout
            </p>
          )}
          {footerItems.map((item) => (
            <NavItem key={item.id} item={item} collapsed={collapsed} small />
          ))}
        </div>
      )}

      {/* Collapse toggle button */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center transition-all duration-200 select-none shrink-0"
        style={{
          height: 36,
          borderTop: "1px solid rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.25)",
        }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="transition-transform duration-300"
          style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    </aside>
  );
}

function NavItem({
  item,
  collapsed,
  small = false,
}: {
  item: SidebarItem;
  collapsed: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={item.onClick}
      title={collapsed ? item.label : undefined}
      className="relative flex items-center gap-2.5 rounded-xl w-full text-left select-none group transition-all duration-150"
      style={{
        height: small ? 30 : 34,
        padding: collapsed ? "0 14px" : "0 10px",
        justifyContent: collapsed ? "center" : "flex-start",
        background: item.active
          ? "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(124,58,237,0.10))"
          : "transparent",
        border: item.active
          ? "1px solid rgba(99,102,241,0.25)"
          : "1px solid transparent",
        boxShadow: item.active
          ? "0 4px 16px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "none",
      }}
      onMouseEnter={(e) => {
        if (!item.active) {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)";
        }
      }}
      onMouseLeave={(e) => {
        if (!item.active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
        }
      }}
      aria-current={item.active ? "page" : undefined}
    >
      {/* Active glow indicator */}
      {item.active && !collapsed && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-full"
          style={{
            height: 18,
            background: "linear-gradient(180deg, #818cf8, #6366f1)",
            boxShadow: "2px 0 8px rgba(99,102,241,0.6)",
          }}
        />
      )}

      {/* Icon */}
      <span
        className="shrink-0 flex items-center justify-center transition-all duration-150"
        style={{
          color: item.active ? "#a5b4fc" : "#6b7280",
          filter: item.active ? "drop-shadow(0 0 6px rgba(165,180,252,0.5))" : "none",
          transform: item.active ? "scale(1.05)" : "scale(1)",
        }}
      >
        {item.icon}
      </span>

      {/* Label */}
      {!collapsed && (
        <span
          className="text-[12px] font-semibold truncate transition-colors duration-150"
          style={{
            color: item.active ? "#e0e7ff" : "#9ca3af",
            letterSpacing: "0.01em",
          }}
        >
          {item.label}
        </span>
      )}

      {/* Badge */}
      {item.badge !== undefined && (
        <span
          className="shrink-0 ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{
            background: item.active ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.07)",
            color: item.active ? "#a5b4fc" : "#6b7280",
            border: `1px solid ${item.active ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}`,
          }}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}
