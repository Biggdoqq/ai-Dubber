import { useEffect } from "react";
import Icon, { type IconName } from "./Icon";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const STYLES: Record<ToastType, { icon: IconName; ring: string; text: string }> = {
  success: { icon: "check", ring: "border-l-success", text: "text-success" },
  error: { icon: "error", ring: "border-l-danger", text: "text-danger" },
  warning: { icon: "warning", ring: "border-l-warning", text: "text-warning" },
  info: { icon: "info", ring: "border-l-accent", text: "text-accent" },
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const style = STYLES[item.type];
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(item.id), 3500);
    return () => window.clearTimeout(t);
  }, [item.id, onDismiss]);

  return (
    <div
      role="status"
      className={`panel shadow-popover border-l-4 ${style.ring} toast-${item.type} flex items-start gap-2.5 px-3 py-2.5
        min-w-[240px] max-w-[380px] animate-slide-in-right transition-all duration-300 hover:scale-[1.01]`}
    >
      <span className={`mt-0.5 shrink-0 ${style.text}`}>
        <Icon name={style.icon} size={16} />
      </span>
      <span className="text-sm text-txt flex-1 break-words">{item.message}</span>
      <button
        className="text-txt-faint hover:text-txt shrink-0 -mr-0.5"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="fixed bottom-6 right-4 z-[200] flex flex-col gap-2 items-end pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast item={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
