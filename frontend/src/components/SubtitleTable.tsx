import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Subtitle, Voice } from "../api/types";
import { fmtClock } from "../lib/format";
import VoicePickerDialog from "./VoicePickerDialog";

interface Props {
  rows: Subtitle[];
  voices: Voice[];
  selected: Set<number>;
  activeRow: number | null;
  onSelect: (index: number, additive: boolean) => void;
  onEdit: (index: number, patch: Partial<Subtitle>) => void;
  onEditMultiple?: (indices: number[], patch: Partial<Subtitle>) => void;
  onSeek: (time: number) => void;
  onPreview: (index: number) => void;
  onSetSelected?: (sel: Set<number>) => void;
  
  onDelete?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
  onTranscribe?: () => void;
  onAutoSpeed?: () => void;
  onMerge?: () => void;
  busy?: boolean;
  onToggleDrawer?: () => void;
  drawerOpen?: boolean;
}

type FilterMode = "all" | "dubbed" | "empty" | "issues" | "locked";
type SortKey = "index" | "start" | "end" | "duration" | "text";
type SortDir = "asc" | "desc";

const MAX_CPS = 25; // chars/sec above which a line is likely too fast to read

function validate(row: Subtitle, prev: Subtitle | null): string[] {
  const issues: string[] = [];
  const dur = row.end - row.start;
  if (!row.text.trim()) issues.push("Empty text");
  if (dur <= 0) issues.push("End is before start");
  if (prev && row.start < prev.end - 0.001) issues.push("Overlaps previous row");
  if (dur > 0 && row.text.trim() && row.text.trim().length / dur > MAX_CPS)
    issues.push("Reading speed too fast");
  return issues;
}

export default function SubtitleTable({
  rows,
  voices,
  selected,
  activeRow,
  onSelect: _onSelect,
  onEdit,
  onEditMultiple,
  onSeek,
  onPreview,
  onSetSelected,
  onDelete,
  onCopy,
  onPaste,
  onDuplicate,
  onTranscribe,
  onAutoSpeed,
  onMerge,
  busy,
  onToggleDrawer,
  drawerOpen,
}: Props) {
  const [picker, setPicker] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [characters, setCharacters] = useState<string[]>([]);
  const [notesOpen, setNotesOpen] = useState<Set<number>>(new Set());
  const [bulkChar, setBulkChar] = useState("");
  
  const [lastSelected, setLastSelected] = useState<number | null>(null);

  useEffect(() => {
    api
      .getCharacters()
      .then((p) => setCharacters(Object.keys(p)))
      .catch(() => {});
  }, []);

  // Per-row validation issues
  const issuesByIndex = useMemo(() => {
    const map = new Map<number, string[]>();
    rows.forEach((r, i) => map.set(i, validate(r, i > 0 ? rows[i - 1] : null)));
    return map;
  }, [rows]);

  // View sorting, filtering and searching
  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = rows.map((row, index) => ({ row, index }));

    if (q) {
      items = items.filter(
        ({ row }) =>
          row.text.toLowerCase().includes(q) ||
          (row.notes ?? "").toLowerCase().includes(q)
      );
    }

    items = items.filter(({ row, index }) => {
      switch (filterMode) {
        case "dubbed":
          return row.text.trim().length > 0;
        case "empty":
          return row.text.trim().length === 0;
        case "issues":
          return (issuesByIndex.get(index) ?? []).length > 0;
        case "locked":
          return !!row.locked;
        default:
          return true;
      }
    });

    const dir = sortDir === "asc" ? 1 : -1;
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "start":
          cmp = a.row.start - b.row.start;
          break;
        case "end":
          cmp = a.row.end - b.row.end;
          break;
        case "duration":
          cmp = a.row.end - a.row.start - (b.row.end - b.row.start);
          break;
        case "text":
          cmp = a.row.text.localeCompare(b.row.text);
          break;
        default:
          cmp = a.index - b.index;
      }
      return cmp * dir;
    });

    return items;
  }, [rows, query, filterMode, sortKey, sortDir, issuesByIndex]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const toggleNotes = (index: number) =>
    setNotesOpen((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });

  // Range and click selection management
  const handleRowClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelected !== null) {
      const start = Math.min(lastSelected, index);
      const end = Math.max(lastSelected, index);
      const next = new Set(selected);
      for (let i = start; i <= end; i++) {
        next.add(i);
      }
      onSetSelected?.(next);
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      next.has(index) ? next.delete(index) : next.add(index);
      onSetSelected?.(next);
      setLastSelected(index);
    } else {
      onSetSelected?.(new Set([index]));
      setLastSelected(index);
      onSeek(rows[index].start);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    if (isTyping && e.key !== "Escape" && e.key !== "Enter") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const current = activeRow !== null ? activeRow : [...selected][0] ?? -1;
      const next = Math.min(rows.length - 1, current + 1);
      if (next >= 0) {
        onSetSelected?.(new Set([next]));
        setLastSelected(next);
        onSeek(rows[next].start);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const current = activeRow !== null ? activeRow : [...selected][0] ?? -1;
      const next = Math.max(0, current - 1);
      if (next >= 0) {
        onSetSelected?.(new Set([next]));
        setLastSelected(next);
        onSeek(rows[next].start);
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (selected.size > 0 && onDelete) {
        e.preventDefault();
        onDelete();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      if (selected.size > 0 && onCopy) {
        e.preventDefault();
        onCopy();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      if (onPaste) {
        e.preventDefault();
        onPaste();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      if (selected.size > 0 && onDuplicate) {
        e.preventDefault();
        onDuplicate();
      }
    } else if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey) {
      if (onToggleDrawer) {
        e.preventDefault();
        onToggleDrawer();
      }
    } else if (e.key === "Escape") {
      onSetSelected?.(new Set());
    }
  };

  const applyToSelected = (patch: Partial<Subtitle>) => {
    if (onEditMultiple) {
      onEditMultiple([...selected], patch);
    } else {
      [...selected].forEach((i) => onEdit(i, patch));
    }
  };
  
  const selectAllVisible = () => onSetSelected?.(new Set(view.map((v) => v.index)));
  const clearSelection = () => onSetSelected?.(new Set());

  const voiceLabel = (id: string) => voices.find((v) => v.id === id)?.label ?? id;

  const totalIssues = useMemo(
    () => [...issuesByIndex.values()].filter((v) => v.length > 0).length,
    [issuesByIndex]
  );

  // Search and replace all matching occurrences in filtered rows
  const handleReplaceAll = () => {
    if (!query) return;
    const targets = selected.size > 0
      ? [...selected].map((idx) => ({ row: rows[idx], index: idx }))
      : view;

    const regex = new RegExp(query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "gi");
    targets.forEach(({ row, index }) => {
      if (row.locked) return;
      if (regex.test(row.text)) {
        const nextText = row.text.replace(regex, replaceText);
        onEdit(index, { text: nextText });
      }
    });

    setQuery("");
    setReplaceText("");
  };

  const th = "px-3 py-2.5 text-[10px] uppercase tracking-wider text-left font-bold text-txt-muted select-none border-b border-white/5 bg-[#131622]/90 sticky top-0 z-10";
  const sortableTh = `${th} cursor-pointer hover:text-txt transition-colors`;

  return (
    <div 
      className="panel flex flex-col overflow-hidden flex-1 min-w-0 min-h-0 bg-[#0d0f17]/40 backdrop-blur-md border border-white/5 rounded-2xl shadow-panel outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Search and filters toolbar */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3 flex-wrap bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-txt flex items-center gap-1.5">
            Subtitle Editor
            <span className="text-txt-faint font-normal">
              ({view.length} / {rows.length})
            </span>
          </span>

          {/* Icon action buttons */}
          <div className="flex items-center gap-0.5 ml-1">
            {onTranscribe && (
              <button
                className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-faint hover:text-accent hover:bg-accent/10 transition-all duration-150 disabled:opacity-30"
                onClick={onTranscribe}
                disabled={busy}
                title="Transcribe Video Audio (Whisper)"
              >
                {/* Microphone icon */}
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            )}
            {onAutoSpeed && (
              <button
                className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-faint hover:text-accent hover:bg-accent/10 transition-all duration-150 disabled:opacity-30"
                onClick={onAutoSpeed}
                disabled={busy || rows.length === 0}
                title="Auto-calculate speech speed ratios"
              >
                {/* Gauge / speedometer icon */}
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </button>
            )}
          </div>

          {totalIssues > 0 && (
            <span
              className="text-[10px] font-bold bg-warning/10 text-warning px-2 py-0.5 rounded-lg border border-warning/20 cursor-pointer animate-pulse"
              title="Show rows with validation errors"
              onClick={() => setFilterMode("issues")}
            >
              ⚠ {totalIssues} issue{totalIssues > 1 ? "s" : ""}
            </span>
          )}
        </div>


        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="input py-1.5 px-3 text-xs w-48 rounded-xl bg-[#0c0d16]/75"
            placeholder="Search text / notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <div className="flex items-center gap-1.5 animate-fade-in">
              <input
                className="input py-1.5 px-3 text-xs w-36 rounded-xl bg-[#0c0d16]/75"
                placeholder="Replace with…"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
              />
              <button
                className="btn-ghost py-1.5 px-3 rounded-xl text-[10px] text-accent font-bold"
                onClick={handleReplaceAll}
                title="Replace all matching occurrences"
              >
                Replace All
              </button>
              <button
                className="text-txt-faint hover:text-txt text-xs transition-colors px-1"
                onClick={() => { setQuery(""); setReplaceText(""); }}
                title="Clear search"
              >
                ✕
              </button>
            </div>
          )}
          <select
            className="input py-1.5 text-xs rounded-xl bg-[#0c0d16]/75"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
          >
            <option value="all" className="bg-bg-panel text-txt">All rows</option>
            <option value="dubbed" className="bg-bg-panel text-txt">Dubbed (has text)</option>
            <option value="empty">Empty</option>
            <option value="issues">Has issues</option>
            <option value="locked">Locked</option>
          </select>

          {onToggleDrawer && (
            <button
              className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border transition-all duration-150 ${
                drawerOpen
                  ? "bg-accent/20 text-accent border-accent/30"
                  : "text-txt-faint border-white/5 hover:border-white/10 hover:text-txt-muted hover:bg-white/[0.03]"
              }`}
              onClick={onToggleDrawer}
              title="Toggle Translation & Voice Controls (T)"
            >
              {/* Translation/Globe + Voice layout icon */}
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* action selection bar */}
      <div className="px-3.5 py-1.5 border-b border-border/40 bg-accent/5 flex items-center justify-between gap-3 flex-wrap text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 ? (
            <>
              <span className="text-accent font-semibold">{selected.size} selected</span>
              <div className="w-px h-3.5 bg-border/60 mx-1" />
              <button className="btn-ghost py-0.5 px-2 hover:bg-accent/10 hover:text-accent rounded" onClick={() => applyToSelected({ locked: true })}>
                🔒 Lock
              </button>
              <button className="btn-ghost py-0.5 px-2 hover:bg-accent/10 hover:text-accent rounded" onClick={() => applyToSelected({ locked: false })}>
                🔓 Unlock
              </button>
              {selected.size >= 2 && onMerge && (
                <button
                  className="btn-ghost py-0.5 px-2 hover:bg-accent/10 hover:text-accent rounded font-bold text-accent"
                  onClick={onMerge}
                  disabled={busy}
                  title="Merge selected subtitle rows"
                >
                  🔗 Merge
                </button>
              )}
              <div className="w-px h-3.5 bg-border/60 mx-1" />
              <select
                className="input py-0.5 text-xs bg-bg-elevated/60"
                value={bulkChar}
                onChange={(e) => {
                  const v = e.target.value;
                  setBulkChar(v);
                  if (v) applyToSelected({ voice: v });
                }}
              >
                <option value="">Assign character…</option>
                {characters.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                className="input py-0.5 text-xs bg-bg-elevated/60"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyToSelected({ gender: e.target.value });
                  e.target.value = "";
                }}
              >
                <option value="">Set gender…</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Unknown">Unknown</option>
              </select>
            </>
          ) : (
            <span className="text-txt-faint italic text-[11px]">Shift+Click select range · Ctrl+C/V/D keys active</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {selected.size > 0 && (
            <>
              <button className="btn-ghost py-0.5 px-2 text-[10px] hover:bg-bg-hover text-txt border border-border/40" onClick={onCopy} title="Copy selected lines (Ctrl+C)">
                📋 Copy
              </button>
              <button className="btn-ghost py-0.5 px-2 text-[10px] hover:bg-bg-hover text-txt border border-border/40" onClick={onDuplicate} title="Duplicate selected lines (Ctrl+D)">
                👯 Duplicate
              </button>
              <button className="btn-ghost py-0.5 px-2 text-[10px] hover:bg-danger/10 text-danger border border-danger/20" onClick={onDelete} title="Delete selected lines (Del)">
                🗑️ Delete
              </button>
            </>
          )}
          <button className="btn-ghost py-0.5 px-2 text-[10px] hover:bg-bg-hover text-txt border border-border/40" onClick={onPaste} title="Paste copied lines (Ctrl+V)">
            📥 Paste
          </button>
          {onSetSelected && (
            <>
              <div className="w-px h-3.5 bg-border/60 mx-1 shrink-0" />
              <button className="btn-ghost py-0.5 px-1.5 text-[10px] rounded hover:text-accent" onClick={selectAllVisible}>
                Select All
              </button>
              <button className="btn-ghost py-0.5 px-1.5 text-[10px] rounded hover:text-accent" onClick={clearSelection}>
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* table scroll wrapper */}
      <div className="overflow-auto flex-1 min-h-0 min-w-0">
        <table className="w-full text-xs border-collapse table-fixed">
          <thead>
            <tr>
              <th className={`${th} w-6 text-center`}></th>
              <th className={`${th} w-8 text-center`}>🔒</th>
              <th className={`${sortableTh} w-10`} onClick={() => toggleSort("index")}>
                #{sortIcon("index")}
              </th>
              <th className={`${sortableTh} w-20`} onClick={() => toggleSort("start")}>
                Start{sortIcon("start")}
              </th>
              <th className={`${sortableTh} w-20`} onClick={() => toggleSort("end")}>
                End{sortIcon("end")}
              </th>
              <th className={`${sortableTh} min-w-[180px]`} onClick={() => toggleSort("text")}>
                Text content{sortIcon("text")}
              </th>
              <th className={`${th} w-16`}>Pitch</th>
              <th className={`${th} w-16`}>Speed</th>
              <th className={`${th} w-14`}>Vol</th>
              <th className={`${th} w-44`}>Voice / Character</th>
              <th className={`${th} w-20`}>Gender</th>
              <th className={`${th} w-20`}>Emotion</th>
              <th className={`${th} w-14`}>Echo</th>
              <th className={`${th} w-16 text-center`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {view.map(({ row, index }) => {
              const isSel = selected.has(index);
              const isActive = activeRow === index;
              const issues = issuesByIndex.get(index) ?? [];
              const locked = !!row.locked;
              const empty = !row.text.trim();
              const dot = locked
                ? "bg-txt-faint"
                : issues.length
                  ? "bg-warning shadow-[0_0_6px_#f59e0b]"
                  : empty
                    ? "bg-border/60"
                    : "bg-success shadow-[0_0_6px_#10b981]";
              const dotTitle = locked
                ? "Locked"
                : issues.length
                  ? issues.join("\n")
                  : empty
                    ? "No text"
                    : "OK";
              const notesShown = notesOpen.has(index) || !!row.notes;
              const disabled = locked;

              return (
                <Fragment key={index}>
                  <tr
                    onClick={(e) => handleRowClick(index, e)}
                    className={`border-t border-border/20 cursor-pointer transition-colors odd:bg-bg/5 even:bg-bg/25 ${
                      isActive
                        ? "bg-accent/25 hover:bg-accent/30 font-semibold"
                        : isSel
                          ? "bg-accent/15 hover:bg-accent/20"
                          : "hover:bg-bg-hover/30"
                    } ${locked ? "opacity-60" : ""}`}
                  >
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full transition-transform ${dot}`}
                        title={dotTitle}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        className={locked ? "text-warning" : "text-txt-faint hover:text-txt"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(index, { locked: !locked });
                        }}
                        title={locked ? "Unlock row" : "Lock row"}
                      >
                        {locked ? "🔒" : "🔓"}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-txt-faint tabular-nums font-semibold">{index + 1}</td>
                    <td
                      className="px-2 py-1.5 font-mono text-txt-muted hover:text-accent transition-colors whitespace-nowrap tabular-nums"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(row.start);
                      }}
                      title="Seek player here"
                    >
                      {fmtClock(row.start)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-txt-muted whitespace-nowrap tabular-nums">
                      {fmtClock(row.end)}
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        id={`sub-text-${index}`}
                        className="w-full bg-transparent border border-transparent hover:border-white/10 focus:border-accent/50 hover:bg-white/[0.02] focus:bg-[#0c0d16]/80 px-2.5 py-1 text-txt focus:outline-none rounded-xl transition-all duration-150 disabled:text-txt-faint"
                        value={row.text}
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onEdit(index, { text: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="number"
                        step={5}
                        min={-100}
                        max={100}
                        className="w-16 bg-transparent border border-transparent hover:border-white/10 focus:border-accent/50 hover:bg-white/[0.02] focus:bg-[#0c0d16]/80 px-1.5 py-1 text-txt text-center focus:outline-none rounded-xl transition-all duration-150 tabular-nums disabled:opacity-50"
                        value={row.pitch}
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onEdit(index, { pitch: parseInt(e.target.value) || 0 })}
                        title="Pitch adjustments"
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="number"
                        step={0.05}
                        min={0.5}
                        max={3}
                        className="w-16 bg-transparent border border-transparent hover:border-white/10 focus:border-accent/50 hover:bg-white/[0.02] focus:bg-[#0c0d16]/80 px-1.5 py-1 text-txt text-center focus:outline-none rounded-xl transition-all duration-150 tabular-nums disabled:opacity-50"
                        value={row.speed}
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onEdit(index, { speed: parseFloat(e.target.value) || 1 })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="number"
                        min={0}
                        max={150}
                        className="w-16 bg-transparent border border-transparent hover:border-white/10 focus:border-accent/50 hover:bg-white/[0.02] focus:bg-[#0c0d16]/80 px-1.5 py-1 text-txt text-center focus:outline-none rounded-xl transition-all duration-150 tabular-nums disabled:opacity-50"
                        value={row.volume}
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onEdit(index, { volume: parseInt(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <div className="flex items-center gap-1">
                        <select
                          className="flex-1 min-w-0 bg-transparent border border-transparent hover:border-white/10 focus:border-accent/50 hover:bg-white/[0.02] focus:bg-[#0c0d16]/80 rounded-xl px-2 py-1 text-txt text-xs focus:outline-none transition-all duration-150"
                          value={row.voice}
                          disabled={disabled}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onEdit(index, { voice: e.target.value })}
                        >
                          <option value="" className="bg-bg-panel text-txt">(default)</option>
                          {characters.length > 0 && (
                            <optgroup label="Characters" className="bg-bg-panel text-txt-muted font-bold">
                              {characters.map((c) => (
                                <option key={c} value={c} className="bg-bg-panel text-txt">{c}</option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Voices" className="bg-bg-panel text-txt-muted font-bold">
                            {voices.map((v) => (
                              <option key={v.id} value={v.id} className="bg-bg-panel text-txt">{v.label}</option>
                            ))}
                          </optgroup>
                          {row.voice &&
                            !characters.includes(row.voice) &&
                            !voices.some((v) => v.id === row.voice) && (
                              <option value={row.voice} className="bg-bg-panel text-txt">{voiceLabel(row.voice)}</option>
                            )}
                        </select>
                        <button
                          className="text-txt-muted hover:text-accent p-1 shrink-0 disabled:opacity-40"
                          disabled={disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPicker(index);
                          }}
                          title="Open full Voice picker"
                        >
                          🔍
                        </button>
                      </div>
                    </td>
                    <td className="px-1 py-0.5">
                      <select
                        className="w-full bg-transparent border border-transparent hover:border-white/10 focus:border-accent/50 hover:bg-white/[0.02] focus:bg-[#0c0d16]/80 rounded-xl px-2 py-1 text-txt text-xs focus:outline-none transition-all duration-150"
                        value={row.gender ?? ""}
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onEdit(index, { gender: e.target.value || null })}
                      >
                        <option value="" className="bg-bg-panel text-txt">—</option>
                        <option value="Male" className="bg-bg-panel text-txt">Male</option>
                        <option value="Female" className="bg-bg-panel text-txt">Female</option>
                        <option value="Unknown" className="bg-bg-panel text-txt">Unknown</option>
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        className="w-24 bg-transparent border border-transparent hover:border-white/10 focus:border-accent/50 hover:bg-white/[0.02] focus:bg-[#0c0d16]/80 px-2 py-1 text-txt text-center focus:outline-none rounded-xl transition-all duration-150 disabled:opacity-50"
                        value={row.emotion ?? ""}
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onEdit(index, { emotion: e.target.value || null })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-16 bg-transparent border border-transparent hover:border-white/10 focus:border-accent/50 hover:bg-white/[0.02] focus:bg-[#0c0d16]/80 px-1.5 py-1 text-txt text-center focus:outline-none rounded-xl transition-all duration-150 tabular-nums disabled:opacity-50"
                        value={row.echo}
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onEdit(index, { echo: parseInt(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-1 py-0.5 text-center whitespace-nowrap">
                      <button
                        className={`hover:text-accent transition-colors ${notesShown ? "text-accent" : "text-txt-faint"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNotes(index);
                        }}
                        title="Edit Row Notes"
                      >
                        📝
                      </button>
                      <button
                        className="text-accent hover:text-accent-hover ml-1.5 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreview(index);
                        }}
                        title="Preview Speech Track"
                      >
                        ▶
                      </button>
                    </td>
                  </tr>
                  {notesShown && (
                    <tr key={`${index}-notes`} className="bg-bg-elevated/30">
                      <td colSpan={2} />
                      <td colSpan={12} className="px-3 py-1">
                        <input
                          className="input py-1 w-full text-xs bg-bg-elevated/40"
                          placeholder="Notes for this line (local notes only)…"
                          value={row.notes ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onEdit(index, { notes: e.target.value })}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {view.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-16 text-center select-none">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <span className="text-4xl filter drop-shadow-md">
                      {rows.length === 0 ? "📝" : "🔍"}
                    </span>
                    <div className="max-w-sm">
                      <h4 className="text-sm font-bold text-txt">
                        {rows.length === 0 ? "No Subtitles Loaded" : "No Match Found"}
                      </h4>
                      <p className="text-xs text-txt-faint font-semibold mt-1 leading-relaxed">
                        {rows.length === 0
                          ? "Load a project video, import an SRT file, or run the AI transcribe workflow to get started."
                          : "No subtitle rows match the current search query or active filter settings."}
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {picker !== null && rows[picker] && (
        <VoicePickerDialog
          voices={voices}
          current={rows[picker].voice}
          previewText={rows[picker].text}
          onSelect={(voiceId) => onEdit(picker, { voice: voiceId })}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
