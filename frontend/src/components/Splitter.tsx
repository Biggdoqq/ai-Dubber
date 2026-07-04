import { useCallback, useRef } from "react";

interface Props {
  orientation: "vertical" | "horizontal";
  onResize: (deltaPx: number) => void;
  className?: string;
}

// A draggable divider. "vertical" = a vertical bar you drag left/right (resizes
// width); "horizontal" = a horizontal bar you drag up/down (resizes height).
export default function Splitter({ orientation, onResize, className = "" }: Props) {
  const last = useRef(0);
  const dragging = useRef(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      const pos = orientation === "vertical" ? e.clientX : e.clientY;
      onResize(pos - last.current);
      last.current = pos;
    },
    [orientation, onResize]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    last.current = orientation === "vertical" ? e.clientX : e.clientY;
    document.body.style.cursor = orientation === "vertical" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const isV = orientation === "vertical";
  return (
    <div
      role="separator"
      aria-orientation={isV ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      className={`group shrink-0 flex items-center justify-center transition-colors
        ${isV ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"}
        hover:bg-accent/40 ${className}`}
    >
      <div
        className={`bg-border group-hover:bg-accent rounded-full transition-colors
          ${isV ? "w-0.5 h-8" : "h-0.5 w-8"}`}
      />
    </div>
  );
}
