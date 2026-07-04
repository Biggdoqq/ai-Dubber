import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { api } from "../api/client";
import type { Subtitle } from "../api/types";
import { fmtClock } from "../lib/format";
import Tooltip from "./Tooltip";

interface Props {
  videoPath: string | null;
  duration: number;
  currentTime: number;
  rows: Subtitle[];
  activeRow: number | null;
  selected: Set<number>;
  onSeek: (time: number) => void;
  onSetSelected: (sel: Set<number>) => void;
  onEditTimings: (edits: { index: number; start: number; end: number }[]) => void;
  onDelete: () => void;
  onMerge: () => void;
  onSplit: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const WAVE_H = 64;
const DUB_H = 48;
const SUB_H = 72;
const RULER_H = 22;
const SNAP_PX = 8;
const EDGE_PX = 8;
const MAX_WIDTH = 24000;
const MIN_DUR = 0.05;

type DragMode = "move" | "l" | "r";
interface DragState {
  mode: DragMode;
  primary: number;
  indices: number[];
  startClientX: number;
  orig: Record<number, [number, number]>;
  moved: boolean;
  additive: boolean;
}
type Edits = Record<number, [number, number]>;

const TICK_STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export default function TimelinePanel({
  videoPath,
  duration,
  currentTime,
  rows,
  activeRow,
  selected,
  onSeek,
  onSetSelected,
  onEditTimings,
  onDelete,
  onMerge,
  onSplit,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dubCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Ref for the playhead needle — moved imperatively to avoid re-renders on every tick
  const playheadRef = useRef<HTMLDivElement>(null);
  
  const [peaks, setPeaks] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewportW, setViewportW] = useState(800);
  const [pxPerSec, setPxPerSec] = useState(0);
  const [snap, setSnap] = useState(true);
  const [showWaveforms, setShowWaveforms] = useState(true);
  const [scrollLeft, setScrollLeft] = useState(0);
  
  const [preview, setPreview] = useState<Edits | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rulerDragging, setRulerDragging] = useState(false);
  const [marquee, setMarquee] = useState<{ x0: number; x1: number } | null>(null);
  const [bgActive, setBgActive] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Snapping guide line state
  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);
  
  // --- live refs ---
  const pxRef = useRef(pxPerSec);
  const snapRef = useRef(snap);
  const durRef = useRef(duration);
  const curRef = useRef(currentTime);
  const rowsRef = useRef(rows);
  const selRef = useRef(selected);
  const dragRef = useRef<DragState | null>(null);
  const bgRef = useRef<{ startClientX: number; scrollStartX: number; x0: number; moved: boolean; additive: boolean } | null>(null);
  const pendingFocalRef = useRef<{ time: number; offset: number } | null>(null);
  
  pxRef.current = pxPerSec;
  snapRef.current = snap;
  durRef.current = duration;
  curRef.current = currentTime;
  rowsRef.current = rows;
  selRef.current = selected;

  const fitPx = duration > 0 ? viewportW / duration : 0;
  const maxPx = duration > 0 ? Math.min(600, MAX_WIDTH / duration) : 0;
  const innerWidth = Math.max(viewportW, duration * pxPerSec);

  // ---- waveform fetch ----
  useEffect(() => {
    if (!videoPath) {
      setPeaks([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .waveform(videoPath, 3000)
      .then((r) => !cancelled && setPeaks(r.peaks))
      .catch(() => !cancelled && setPeaks([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [videoPath]);

  // ---- viewport width & scroll tracking ----
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // ---- default zoom = fit whole clip ----
  useEffect(() => {
    if (fitPx > 0) setPxPerSec((p) => (p <= 0 ? fitPx : p));
  }, [fitPx]);

  // ---- keep a focal point stable across zoom ----
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const pf = pendingFocalRef.current;
    if (el && pf) {
      el.scrollLeft = pf.time * pxPerSec - pf.offset;
      pendingFocalRef.current = null;
    }
  }, [pxPerSec]);

  const clampPx = useCallback(
    (p: number) => Math.max(fitPx || p, Math.min(maxPx || p, p)),
    [fitPx, maxPx]
  );

  const zoomAt = useCallback(
    (factor: number, focalClientX?: number) => {
      const el = scrollRef.current;
      if (!el || durRef.current <= 0) return;
      const rect = el.getBoundingClientRect();
      const cx = focalClientX ?? rect.left + rect.width / 2;
      const offset = cx - rect.left;
      const time = (el.scrollLeft + offset) / pxRef.current;
      const next = clampPx(pxRef.current * factor);
      pendingFocalRef.current = { time, offset };
      setPxPerSec(next);
    },
    [clampPx]
  );

  const zoomToRange = useCallback(
    (s: number, e: number) => {
      const el = scrollRef.current;
      if (!el || e <= s) return;
      const target = clampPx((viewportW * 0.9) / (e - s));
      pendingFocalRef.current = { time: s, offset: viewportW * 0.05 };
      setPxPerSec(target);
    },
    [clampPx, viewportW]
  );

  // ---- ctrl+wheel zoom ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.25 : 1 / 1.25, e.clientX);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---- original waveform draw ----
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c || !showWaveforms) return;
    const w = Math.max(1, Math.round(innerWidth));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(WAVE_H * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${WAVE_H}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, w, WAVE_H);
    if (peaks.length === 0) return;
    const cy = WAVE_H / 2;
    const maxH = WAVE_H / 2 - 3;

    // Gradient envelope
    const grad = ctx.createLinearGradient(0, 0, 0, WAVE_H);
    grad.addColorStop(0, "#10b981"); // emerald green
    grad.addColorStop(0.5, "#059669");
    grad.addColorStop(1, "#10b981");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    const step = 2; // Downsample drawing to every 2 pixels to reduce canvas path draw load
    for (let x = 0; x < w; x += step) {
      const p = peaks[Math.floor((x / w) * peaks.length)] ?? 0;
      ctx.lineTo(x, cy - p * maxH);
    }
    for (let x = w - 1; x >= 0; x -= step) {
      const p = peaks[Math.floor((x / w) * peaks.length)] ?? 0;
      ctx.lineTo(x, cy + p * maxH);
    }
    ctx.closePath();
    ctx.fill();

    // Inner RMS body
    ctx.fillStyle = "rgba(167, 243, 208, 0.35)";
    ctx.beginPath();
    ctx.moveTo(0, cy);
    for (let x = 0; x < w; x += step) {
      const p = peaks[Math.floor((x / w) * peaks.length)] ?? 0;
      ctx.lineTo(x, cy - p * maxH * 0.55);
    }
    for (let x = w - 1; x >= 0; x -= step) {
      const p = peaks[Math.floor((x / w) * peaks.length)] ?? 0;
      ctx.lineTo(x, cy + p * maxH * 0.55);
    }
    ctx.closePath();
    ctx.fill();

    // Center line
    ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
  }, [peaks, innerWidth, showWaveforms]);

  // ---- dub audio waveform draw ----
  useLayoutEffect(() => {
    const c = dubCanvasRef.current;
    if (!c || !showWaveforms) return;
    const w = Math.max(1, Math.round(innerWidth));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(DUB_H * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${DUB_H}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, w, DUB_H);
    
    if (rows.length === 0 || pxPerSec <= 0) return;
    const cy = DUB_H / 2;
    const maxH = DUB_H / 2 - 4;

    // Viewport culling: only draw segments visible in the scroll window + a small buffer
    const visLeft = scrollLeft - 100;
    const visRight = scrollLeft + viewportW + 100;
    
    ctx.fillStyle = "rgba(139, 92, 246, 0.3)"; // soft violet
    ctx.strokeStyle = "rgba(167, 139, 250, 0.75)"; // bright violet border
    ctx.lineWidth = 1;
    
    rows.forEach((r) => {
      const left = r.start * pxPerSec;
      const right = r.end * pxPerSec;
      if (right <= left) return;
      // Skip entirely off-screen segments
      if (right < visLeft || left > visRight) return;
      
      ctx.beginPath();
      ctx.moveTo(left, cy);
      const step = 4; // Downsample dub waveform to every 4px for speed
      for (let x = left; x <= right; x += step) {
        const dist = Math.min(x - left, right - x);
        const fade = Math.min(1.0, dist / 12);
        const seed = Math.sin(x * 0.35) * Math.cos(x * 0.12);
        const h = Math.abs(seed) * maxH * fade;
        ctx.lineTo(x, cy - h);
      }
      for (let x = right; x >= left; x -= step) {
        const dist = Math.min(x - left, right - x);
        const fade = Math.min(1.0, dist / 12);
        const seed = Math.sin(x * 0.35) * Math.cos(x * 0.12);
        const h = Math.abs(seed) * maxH * fade;
        ctx.lineTo(x, cy + h);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }, [rows, innerWidth, pxPerSec, showWaveforms, scrollLeft, viewportW]);

  // ---- snapping ----
  const snapTime = useCallback((t: number, moving: Set<number>): { time: number; snapped: boolean } => {
    const px = pxRef.current;
    if (!snapRef.current || px <= 0) return { time: t, snapped: false };
    const thr = SNAP_PX / px;
    let best = t;
    let bestD = thr;
    let snapped = false;
    const pts: number[] = [0, curRef.current];
    if (durRef.current > 0) pts.push(durRef.current);
    rowsRef.current.forEach((r, i) => {
      if (!moving.has(i)) {
        pts.push(r.start, r.end);
      }
    });
    for (const c of pts) {
      const d = Math.abs(c - t);
      if (d < bestD) {
        bestD = d;
        best = c;
        snapped = true;
      }
    }
    return { time: best, snapped };
  }, []);

  const computeEdits = useCallback(
    (d: DragState, dt: number): Edits => {
      const result: Edits = {};
      let activeSnapTime: number | null = null;
      if (d.mode === "move") {
        const moving = new Set(d.indices);
        const [os, oe] = d.orig[d.primary];
        let sdt = dt;
        
        const snapS = snapTime(os + dt, moving);
        const snapE = snapTime(oe + dt, moving);
        
        const ds = snapS.time - (os + dt);
        const de = snapE.time - (oe + dt);
        
        if (snapS.snapped && snapE.snapped) {
          if (Math.abs(ds) <= Math.abs(de)) {
            sdt = dt + ds;
            activeSnapTime = snapS.time;
          } else {
            sdt = dt + de;
            activeSnapTime = snapE.time;
          }
        } else if (snapS.snapped) {
          sdt = dt + ds;
          activeSnapTime = snapS.time;
        } else if (snapE.snapped) {
          sdt = dt + de;
          activeSnapTime = snapE.time;
        }
        
        let minStart = Infinity;
        for (const i of d.indices) minStart = Math.min(minStart, d.orig[i][0]);
        if (minStart + sdt < 0) sdt = -minStart;
        for (const i of d.indices) {
          const [s, e] = d.orig[i];
          result[i] = [s + sdt, e + sdt];
        }
      } else if (d.mode === "l") {
        const [os, oe] = d.orig[d.primary];
        const snapRes = snapTime(os + dt, new Set([d.primary]));
        let ns = Math.max(0, Math.min(snapRes.time, oe - MIN_DUR));
        if (snapRes.snapped && ns === snapRes.time) {
          activeSnapTime = snapRes.time;
        }
        result[d.primary] = [ns, oe];
      } else {
        const [os, oe] = d.orig[d.primary];
        const snapRes = snapTime(oe + dt, new Set([d.primary]));
        let ne = Math.max(snapRes.time, os + MIN_DUR);
        if (durRef.current > 0) ne = Math.min(ne, durRef.current);
        if (snapRes.snapped && ne === snapRes.time) {
          activeSnapTime = snapRes.time;
        }
        result[d.primary] = [os, ne];
      }
      setSnapGuideTime(activeSnapTime);
      return result;
    },
    [snapTime]
  );

  const selectClick = useCallback(
    (index: number, additive: boolean) => {
      if (additive) {
        const next = new Set(selRef.current);
        next.has(index) ? next.delete(index) : next.add(index);
        onSetSelected(next);
      } else {
        onSetSelected(new Set([index]));
      }
    },
    [onSetSelected]
  );

  const handleDoubleClick = (index: number) => {
    const r = rows[index];
    onSeek(r.start);
    onSetSelected(new Set([index]));
    const el = document.getElementById(`sub-text-${index}`);
    if (el) {
      el.focus();
      (el as HTMLInputElement).select();
    }
  };

  // ---- block drag / resize ----
  useEffect(() => {
    if (!dragActive) return;
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (Math.abs(ev.clientX - d.startClientX) > 3) d.moved = true;
      const dt = (ev.clientX - d.startClientX) / pxRef.current;
      setPreview(computeEdits(d, dt));
    };
    const onUp = (ev: PointerEvent) => {
      const d = dragRef.current;
      setDragActive(false);
      setPreview(null);
      setSnapGuideTime(null);
      dragRef.current = null;
      if (!d) return;
      if (d.moved) {
        const dt = (ev.clientX - d.startClientX) / pxRef.current;
        const edits = computeEdits(d, dt);
        onEditTimings(
          Object.entries(edits).map(([i, [s, e]]) => ({ index: +i, start: s, end: e }))
        );
      } else if (d.mode === "move") {
        selectClick(d.primary, d.additive);
        onSeek(d.orig[d.primary][0]);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragActive, computeEdits, onEditTimings, onSeek, selectClick]);

  const startDrag = (e: React.PointerEvent, index: number, mode: DragMode) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setMenu(null);
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    let indices: number[];
    if (mode === "move") {
      indices = selected.has(index) ? [...selected] : [index];
    } else {
      indices = [index];
    }
    const orig: Record<number, [number, number]> = {};
    for (const i of indices) orig[i] = [rows[i].start, rows[i].end];
    orig[index] = [rows[index].start, rows[index].end];
    dragRef.current = { mode, primary: index, indices, startClientX: e.clientX, orig, moved: false, additive };
    setDragActive(true);
  };

  // ---- timeline drag/scroll & marquee ----
  const contentX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return clientX - rect.left + el.scrollLeft;
  };

  useEffect(() => {
    if (!bgActive) return;
    const onMove = (ev: PointerEvent) => {
      const b = bgRef.current;
      if (!b) return;
      const dx = ev.clientX - b.startClientX;
      if (Math.abs(dx) > 3) b.moved = true;
      
      if (b.additive) {
        setMarquee({ x0: b.x0, x1: contentX(ev.clientX) });
      } else {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = b.scrollStartX - dx;
        }
      }
    };
    const onUp = (ev: PointerEvent) => {
      const b = bgRef.current;
      setBgActive(false);
      setMarquee(null);
      bgRef.current = null;
      if (!b) return;
      const px = pxRef.current;
      
      if (b.moved) {
        if (b.additive) {
          const x1 = contentX(ev.clientX);
          const lo = Math.min(b.x0, x1) / px;
          const hi = Math.max(b.x0, x1) / px;
          const hits = new Set<number>();
          rowsRef.current.forEach((r, i) => {
            if (r.end >= lo && r.start <= hi) hits.add(i);
          });
          onSetSelected(hits);
        }
      } else {
        onSetSelected(new Set());
        onSeek(b.x0 / px);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [bgActive, onSetSelected, onSeek]);

  const startBg = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    setMenu(null);
    bgRef.current = {
      startClientX: e.clientX,
      scrollStartX: scrollRef.current?.scrollLeft || 0,
      x0: contentX(e.clientX),
      moved: false,
      additive: e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1, // middle click pans, left + modifiers draws marquee
    };
    setBgActive(true);
  };

  const seekFromRuler = (e: React.PointerEvent) => {
    if (pxPerSec <= 0) return;
    onSeek(contentX(e.clientX) / pxPerSec);
  };

  // ---- Playhead Ruler Dragging ----
  const startRulerDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setRulerDragging(true);
    seekFromRuler(e);
  };

  useEffect(() => {
    if (!rulerDragging) return;
    const onMove = (ev: PointerEvent) => {
      if (pxRef.current <= 0) return;
      const newTime = Math.max(0, Math.min(durRef.current, contentX(ev.clientX) / pxRef.current));
      onSeek(newTime);
    };
    const onUp = () => {
      setRulerDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [rulerDragging, onSeek]);

  // ---- keyboard shortcuts ----
  const nudge = (delta: number) => {
    if (selected.size === 0) return;
    const edits = [...selected].map((i) => ({
      index: i,
      start: Math.max(0, rows[i].start + delta),
      end: Math.max(0, rows[i].end + delta),
    }));
    onEditTimings(edits);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (e.key === "+" || e.key === "=") {
      e.stopPropagation();
      zoomAt(1.25);
    } else if (e.key === "-" || e.key === "_") {
      e.stopPropagation();
      zoomAt(1 / 1.25);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.stopPropagation();
      onDelete();
    } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
      e.stopPropagation();
      onSplit();
    } else if (e.key.toLowerCase() === "m" && !e.ctrlKey && !e.metaKey) {
      e.stopPropagation();
      onMerge();
    } else if (e.key === "ArrowLeft") {
      e.stopPropagation();
      e.preventDefault();
      nudge(e.shiftKey ? -0.5 : -0.05);
    } else if (e.key === "ArrowRight") {
      e.stopPropagation();
      e.preventDefault();
      nudge(e.shiftKey ? 0.5 : 0.05);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.stopPropagation();
      e.preventDefault();
      onSetSelected(new Set(rows.map((_, i) => i)));
    } else if (e.key === "Escape") {
      setMenu(null);
      onSetSelected(new Set());
    }
  };

  // ---- auto-scroll to keep the playhead visible ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pxPerSec <= 0 || dragActive || bgActive || rulerDragging) return;
    const x = currentTime * pxPerSec;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    if (x < left + 60 || x > right - 60) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3);
    }
  }, [currentTime, pxPerSec, dragActive, bgActive, rulerDragging]);

  // ---- imperative playhead needle positioning (no React re-render) ----
  useEffect(() => {
    const el = playheadRef.current;
    if (!el || pxPerSec <= 0) return;
    el.style.left = `${currentTime * pxPerSec}px`;
  }, [currentTime, pxPerSec]);

  // ---- context menu ----
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const openMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selected.has(index)) onSetSelected(new Set([index]));
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const selBounds = (): [number, number] | null => {
    if (selected.size === 0) return null;
    let s = Infinity;
    let e = -Infinity;
    for (const i of selected) {
      s = Math.min(s, rows[i].start);
      e = Math.max(e, rows[i].end);
    }
    return [s, e];
  };

  // ---- ruler ticks ----
  const tickStep =
    TICK_STEPS.find((s) => s * pxPerSec >= 80) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: number[] = [];
  if (pxPerSec > 0 && duration > 0) {
    for (let t = 0; t <= duration + 0.001; t += tickStep) ticks.push(t);
  }

  const blockTiming = (i: number): [number, number] =>
    preview && preview[i] ? preview[i] : [rows[i].start, rows[i].end];

  const zoomPct = fitPx > 0 ? Math.round((pxPerSec / fitPx) * 100) : 100;

  // ---- 1D Virtualization of subtitle blocks ----
  const visibleBlocks = useMemo(() => {
    const leftLimit = scrollLeft - 150;
    const rightLimit = scrollLeft + viewportW + 150;
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => {
        const [s, e] = preview && preview[i] ? preview[i] : [r.start, r.end];
        const startPx = s * pxPerSec;
        const endPx = e * pxPerSec;
        return endPx >= leftLimit && startPx <= rightLimit;
      });
  }, [rows, pxPerSec, scrollLeft, viewportW, preview]);

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="panel flex flex-col overflow-hidden outline-none bg-[#0b0d15]/60 backdrop-blur-2xl select-none border border-white/5 rounded-2xl shadow-panel"
    >
      {/* ── Timeline control toolbar ── */}
      <div className="px-3.5 py-2 bg-white/[0.01] border-b border-white/5 flex items-center gap-2 flex-wrap text-xs">

        {/* Title */}
        <span className="font-bold text-txt text-[11px] mr-1 shrink-0 flex items-center gap-1.5">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          Timeline
        </span>

        {/* Toggle pills */}
        <div className="flex items-center gap-1.5">
          <button
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-150 border ${
              snap ? "bg-accent/20 text-accent border-accent/30" : "text-txt-faint border-white/5 hover:border-white/10 hover:text-txt-muted"
            }`}
            onClick={() => setSnap(!snap)}
            title="Toggle magnet snapping to block edges and playhead (S)"
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor"><path d="M8 3a5 5 0 0 0-5 5h2a3 3 0 0 1 3-3V3zM3 8v8h2V8H3zm2 8a5 5 0 0 0 5 5v-2a3 3 0 0 1-3-3H5zm5 5h6v-2H10v2zm6 0a5 5 0 0 0 5-5h-2a3 3 0 0 1-3 3v2zm5-5V8h-2v8h2zm-2-8a5 5 0 0 0-5-5v2a3 3 0 0 1 3 3h2zm-5-5H10V3h6v2z"/></svg>
            Snap {snap ? "On" : "Off"}
          </button>
          <button
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-150 border ${
              showWaveforms ? "bg-accent/20 text-accent border-accent/30" : "text-txt-faint border-white/5 hover:border-white/10 hover:text-txt-muted"
            }`}
            onClick={() => setShowWaveforms(!showWaveforms)}
            title="Toggle waveform visualization tracks"
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Waves {showWaveforms ? "On" : "Off"}
          </button>
        </div>

        <div className="w-px h-4 bg-white/8 mx-0.5 shrink-0" />

        {/* Zoom strip */}
        <div className="flex items-center gap-1.5">
          <button
            className="w-6 h-6 flex items-center justify-center rounded-lg text-txt-faint hover:text-txt hover:bg-white/[0.05] transition-all disabled:opacity-30"
            onClick={() => zoomAt(1 / 1.25)} disabled={!videoPath} title="Zoom out (-)">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <input
            type="range"
            min={Math.log(fitPx || 1)}
            max={Math.log(maxPx || 100)}
            step={0.01}
            value={Math.log(pxPerSec || fitPx || 1)}
            onChange={(e) => setPxPerSec(Math.exp(parseFloat(e.target.value)))}
            className="w-24 h-1 rounded-full appearance-none cursor-pointer accent-accent bg-white/10"
            title="Drag to zoom"
          />
          <button
            className="w-6 h-6 flex items-center justify-center rounded-lg text-txt-faint hover:text-txt hover:bg-white/[0.05] transition-all disabled:opacity-30"
            onClick={() => zoomAt(1.25)} disabled={!videoPath} title="Zoom in (+)">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <span className="text-[10px] text-txt-faint w-9 text-right font-mono tabular-nums">{zoomPct}%</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="px-2 py-1 rounded-lg text-[10px] text-txt-faint border border-white/5 hover:border-white/10 hover:text-txt transition-all disabled:opacity-30"
            onClick={() => zoomToRange(0, duration)}
            disabled={!videoPath}
            title="Fit entire clip in view"
          >Fit All</button>
          <button
            className="px-2 py-1 rounded-lg text-[10px] text-txt-faint border border-white/5 hover:border-white/10 hover:text-txt transition-all disabled:opacity-30"
            onClick={() => { const b = selBounds(); if (b) zoomToRange(b[0], b[1]); }}
            disabled={selected.size === 0}
            title="Zoom to selected range"
          >Fit Sel</button>
        </div>

        <div className="w-px h-4 bg-white/8 mx-0.5 shrink-0" />

        {/* Edit actions */}
        <div className="flex items-center gap-1">
          <button
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-txt-faint border border-white/5 hover:border-white/10 hover:text-txt transition-all"
            onClick={onSplit} title="Split block at playhead (S)">
            <span className="flex items-center gap-1">
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="19 9 12 2 5 9"/><polyline points="5 15 12 22 19 15"/></svg>
              Split
            </span>
          </button>
          <button
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-txt-faint border border-white/5 hover:border-white/10 hover:text-txt transition-all disabled:opacity-30"
            onClick={onMerge} disabled={selected.size < 2} title="Merge selected blocks (M)">
            <span className="flex items-center gap-1">
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              Merge
            </span>
          </button>

          <div className="w-px h-4 bg-white/8 mx-0.5 shrink-0" />

          <button
            className="w-6 h-6 flex items-center justify-center rounded-lg text-txt-faint hover:text-txt hover:bg-white/[0.05] transition-all disabled:opacity-30"
            onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
          </button>
          <button
            className="w-6 h-6 flex items-center justify-center rounded-lg text-txt-faint hover:text-txt hover:bg-white/[0.05] transition-all disabled:opacity-30"
            onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.5"/></svg>
          </button>
        </div>

        {/* Current time readout — right-aligned */}
        <span className="ml-auto text-[11px] text-txt-muted font-mono tabular-nums">
          {loading ? (
            <span className="text-txt-faint animate-pulse">Loading waveform…</span>
          ) : videoPath ? (
            fmtClock(currentTime)
          ) : (
            <span className="text-txt-faint">No media</span>
          )}
        </span>
      </div>

      {/* timeline tracks container */}
      <div 
        ref={scrollRef} 
        onScroll={handleScroll}
        className="relative overflow-x-auto overflow-y-hidden bg-bg/30"
      >
        <div className="relative select-none" style={{ width: innerWidth }}>
          {/* ── Ruler track ── */}
          <div
            className="relative bg-[#07080f] border-b border-white/5 cursor-ew-resize"
            style={{ height: RULER_H }}
            onPointerDown={startRulerDrag}
          >
            {ticks.map((t, i) => {
              const isMajor = i % 5 === 0;
              return (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 border-l ${
                    isMajor ? "border-white/15" : "border-white/5"
                  }`}
                  style={{ left: t * pxPerSec }}
                >
                  {isMajor && (
                    <span className="absolute left-1 top-0.5 text-[8.5px] text-txt-faint font-mono whitespace-nowrap tracking-tight">
                      {fmtClock(t)}
                    </span>
                  )}
                  {!isMajor && (
                    <div className="absolute bottom-0 h-1.5 w-px bg-white/8" />
                  )}
                </div>
              );
            })}
          </div>

          {/* waveforms visualization */}
          {showWaveforms && (
            <div className="flex flex-col border-b border-border/30 bg-bg/10">
              {/* original audio wave */}
              <div className="relative border-b border-border/10" style={{ height: WAVE_H }}>
                <span className="absolute top-1 left-2.5 text-[9px] font-bold text-success/70 tracking-wider z-10 pointer-events-none uppercase">
                  🎤 Original Audio Wave
                </span>
                <canvas ref={canvasRef} className="block" style={{ width: innerWidth, height: WAVE_H }} />
                {!videoPath && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-txt-faint font-medium">
                    Waveform will display once a video is loaded
                  </div>
                )}
              </div>
              {/* dubbed tts envelope wave */}
              <div className="relative" style={{ height: DUB_H }}>
                <span className="absolute top-1 left-2.5 text-[9px] font-bold text-accent/70 tracking-wider z-10 pointer-events-none uppercase">
                  🗣 Dubbed Voice Envelope (Realtime)
                </span>
                <canvas ref={dubCanvasRef} className="block" style={{ width: innerWidth, height: DUB_H }} />
              </div>
            </div>
          )}

          {/* ── Subtitle block edit track ── */}
          <div
            className="relative bg-[#080a12]/50 border-t border-white/5"
            style={{ height: SUB_H }}
            onPointerDown={startBg}
          >
            {/* Track label */}
            <span className="absolute top-1.5 left-3 text-[8.5px] font-bold text-white/20 z-10 pointer-events-none uppercase tracking-widest">
              Subtitles
            </span>

            {pxPerSec > 0 &&
              visibleBlocks.map(({ r, i }) => {
                const [s, e] = blockTiming(i);
                const left = s * pxPerSec;
                const width = Math.max((e - s) * pxPerSec, 4);
                const dur = e - s;

                const isSel = selected.has(i);
                const isActive = activeRow === i;
                const isLocked = !!r.locked;

                const stateClass = isActive
                  ? "bg-gradient-to-b from-accent to-accent/70 text-white border-accent/80 shadow-[0_0_10px_rgba(99,102,241,0.45)]"
                  : isSel
                    ? "bg-accent/30 text-white border-accent/70 shadow-[0_0_6px_rgba(99,102,241,0.25)]"
                    : isLocked
                      ? "bg-white/5 text-white/30 border-white/10"
                      : "bg-accent/10 text-white/60 border-accent/20 hover:bg-accent/20 hover:border-accent/50 hover:text-white/90 transition-all duration-100";

                const tooltipContent = [
                  r.text || `Segment ${i + 1}`,
                  `${fmtClock(s)} → ${fmtClock(e)}  (${dur.toFixed(2)}s)`,
                  isLocked ? "🔒 Locked" : "",
                ].filter(Boolean).join("\n");

                return (
                  <Tooltip key={i} label={tooltipContent}>
                    <div
                      className={`absolute rounded-lg overflow-hidden text-[10px] border cursor-grab active:cursor-grabbing group ${stateClass}`}
                      style={{ left, width, top: 18, height: SUB_H - 24 }}
                      onPointerDown={(ev) => startDrag(ev, i, "move")}
                      onDoubleClick={() => handleDoubleClick(i)}
                      onContextMenu={(ev) => openMenu(ev, i)}
                    >
                      {/* Left resize handle */}
                      <div
                        className="absolute left-0 top-0 bottom-0 z-10 cursor-col-resize"
                        style={{ width: EDGE_PX }}
                        onPointerDown={(ev) => startDrag(ev, i, "l")}
                      >
                        <div className="absolute inset-y-2 left-1 w-0.5 rounded-full bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {/* Right resize handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 z-10 cursor-col-resize"
                        style={{ width: EDGE_PX }}
                        onPointerDown={(ev) => startDrag(ev, i, "r")}
                      >
                        <div className="absolute inset-y-2 right-1 w-0.5 rounded-full bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {/* Row index badge + text */}
                      <div className="px-2.5 py-1 truncate pointer-events-none select-none flex items-center gap-1.5 h-full">
                        <span className={`shrink-0 text-[8px] font-bold px-1 py-0.5 rounded min-w-[16px] text-center tabular-nums ${
                          isActive ? "bg-white/20 text-white" : "bg-white/10 text-white/50"
                        }`}>
                          {i + 1}
                        </span>
                        {width >= 72 && (
                          <span className="truncate text-[9.5px] leading-tight">{r.text}</span>
                        )}
                      </div>
                    </div>
                  </Tooltip>
                );
              })}

            {/* Marquee selection box */}
            {marquee && (
              <div
                className="absolute top-0 bottom-0 bg-accent/15 border border-accent/50 border-dashed pointer-events-none rounded"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                }}
              />
            )}

            {/* Magnet snap guide line */}
            {snap && snapGuideTime !== null && pxPerSec > 0 && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: snapGuideTime * pxPerSec }}
              >
                <div className="absolute inset-0 w-px bg-amber-400/80" />
                <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-amber-400/80" />
              </div>
            )}
          </div>

          {/* Playhead needle — moved imperatively to avoid re-renders on every media tick */}
          {videoPath && pxPerSec > 0 && (
            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{ left: currentTime * pxPerSec }}
            >
              {/* Needle line */}
              <div className="absolute inset-0 w-px bg-emerald-400/90 shadow-[0_0_4px_#34d399]" />
              {/* Diamond head */}
              <div className="absolute -top-px left-1/2 -translate-x-1/2 w-0 h-0"
                style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid #34d399" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* context menu trigger */}
      {menu && (
        <div
          className="fixed z-50 min-w-[180px] panel py-1 shadow-2xl text-xs border border-border/80 bg-bg-panel/95 backdrop-blur-md"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MenuItem
            label="🎯 Seek Playhead here"
            onClick={() => {
              const i = [...selected][0];
              if (i != null) onSeek(rows[i].start);
              setMenu(null);
            }}
          />
          <MenuItem
            label="✂ Split at Playhead (S)"
            onClick={() => {
              onSplit();
              setMenu(null);
            }}
          />
          <MenuItem
            label="⧉ Merge Selected Blocks (M)"
            disabled={selected.size < 2}
            onClick={() => {
              onMerge();
              setMenu(null);
            }}
          />
          <div className="my-1 border-t border-border/50" />
          <MenuItem
            label="📋 Copy block (Ctrl+C)"
            disabled={selected.size === 0}
            onClick={() => {
              onCopy();
              setMenu(null);
            }}
          />
          <MenuItem
            label="📥 Paste block (Ctrl+V)"
            onClick={() => {
              onPaste();
              setMenu(null);
            }}
          />
          <div className="my-1 border-t border-border/50" />
          <MenuItem
            label="↩ Undo operation (Ctrl+Z)"
            disabled={!canUndo}
            onClick={() => {
              onUndo();
              setMenu(null);
            }}
          />
          <MenuItem
            label="↪ Redo operation (Ctrl+Y)"
            disabled={!canRedo}
            onClick={() => {
              onRedo();
              setMenu(null);
            }}
          />
          <div className="my-1 border-t border-border/50" />
          <MenuItem
            label="🗑 Delete block (Del)"
            disabled={selected.size === 0}
            onClick={() => {
              onDelete();
              setMenu(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-txt hover:bg-accent/15 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {label}
    </button>
  );
}
