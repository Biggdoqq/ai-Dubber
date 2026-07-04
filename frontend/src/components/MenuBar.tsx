import { useEffect, useRef, useState } from "react";

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

interface Props {
  menus: Menu[];
}

export default function MenuBar({ menus }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div
      ref={ref}
      className="flex items-stretch bg-bg-panel/40 backdrop-blur-md border-b border-white/5 text-xs select-none h-9 items-center px-2"
    >
      {menus.map((menu) => {
        const isOpen = open === menu.label;
        return (
          <div key={menu.label} className="relative flex items-center">
            <button
              className={`px-3 py-1.5 rounded-lg text-txt-muted hover:text-txt hover:bg-white/[0.04] transition-all duration-150 font-medium ${
                isOpen ? "bg-white/[0.08] text-txt" : ""
              }`}
              onClick={() => setOpen(isOpen ? null : menu.label)}
              onMouseEnter={() => open && setOpen(menu.label)}
            >
              {menu.label}
            </button>
            {isOpen && (
              <div className="absolute left-0 top-full z-50 min-w-[240px] panel bg-[#0d0f17]/95 backdrop-blur-2xl border border-white/5 rounded-2xl shadow-2xl p-1.5 mt-1 animate-scale-in">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div key={i} className="my-1.5 border-t border-white/5" />
                  ) : (
                    <button
                      key={i}
                      disabled={item.disabled}
                      title={item.hint}
                      onClick={() => {
                        setOpen(null);
                        item.onClick?.();
                      }}
                      className="w-full flex items-center justify-between gap-6 px-3 py-1.5 text-left rounded-xl text-txt hover:bg-accent/15 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-txt transition-all duration-150"
                    >
                      <span className="font-medium">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[10px] text-txt-faint font-mono bg-white/[0.03] border border-white/5 px-1.5 py-0.5 rounded">
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
  );
}
