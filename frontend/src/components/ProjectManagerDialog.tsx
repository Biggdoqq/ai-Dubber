import { useEffect, useMemo, useState } from "react";
import type { Subtitle } from "../api/types";
import { fmtClock } from "../lib/format";
import {
  getRecent, removeRecent, clearRecent,
  getBookmarks, addBookmark, removeBookmark,
  getLayout, saveLayout,
  getAutosave, clearAutosave,
  type RecentProject, type Bookmark, type WorkspaceLayout, type AutosaveSnapshot,
} from "../lib/projectStore";

interface Props {
  currentPath: string | null;
  currentName: string | null;
  rows: Subtitle[];
  videoDuration: number;
  autosaveEnabled: boolean;
  layout: WorkspaceLayout;
  onToggleAutosave: (on: boolean) => void;
  onOpenPath: (path: string) => void;
  onApplyLayout: (layout: WorkspaceLayout) => void;
  onRecover: (snap: AutosaveSnapshot) => void;
  onClose: () => void;
  notify: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
}

type Tab = "recent" | "bookmarks" | "layout" | "stats" | "recovery";

const TABS: { id: Tab; icon: string; label: string; desc: string }[] = [
  { id: "recent", icon: "🕑", label: "Recent Projects", desc: "Reopen a recently used project by path." },
  { id: "bookmarks", icon: "⭐", label: "Bookmarks", desc: "Pinned projects you return to often." },
  { id: "layout", icon: "🗂", label: "Workspace Layout", desc: "Save and restore the panel arrangement." },
  { id: "stats", icon: "📊", label: "Project Statistics", desc: "Metrics for the currently loaded project." },
  { id: "recovery", icon: "♻", label: "Recovery", desc: "Restore unsaved work from the last autosave." },
];

const fmtWhen = (ts: number): string => {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
};

export default function ProjectManagerDialog({
  currentPath,
  currentName,
  rows,
  videoDuration,
  autosaveEnabled,
  layout,
  onToggleAutosave,
  onOpenPath,
  onApplyLayout,
  onRecover,
  onClose,
  notify,
}: Props) {
  const [tab, setTab] = useState<Tab>("recent");
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [savedLayout, setSavedLayout] = useState<WorkspaceLayout | null>(null);
  const [autosave, setAutosave] = useState<AutosaveSnapshot | null>(null);
  const [bmNote, setBmNote] = useState("");

  useEffect(() => {
    setRecent(getRecent());
    setBookmarks(getBookmarks());
    setSavedLayout(getLayout());
    setAutosave(getAutosave());
  }, []);

  const active = TABS.find((t) => t.id === tab)!;

  const stats = useMemo(() => {
    const dubbed = rows.filter((r) => r.text.trim().length > 0).length;
    const chars = rows.reduce((s, r) => s + r.text.trim().length, 0);
    const spoken = rows.reduce((s, r) => s + Math.max(0, r.end - r.start), 0);
    const voices = new Set(rows.map((r) => r.voice).filter(Boolean));
    const genders = { Male: 0, Female: 0, Unknown: 0, none: 0 };
    rows.forEach((r) => {
      const g = (r.gender as keyof typeof genders) || "none";
      if (g in genders) genders[g]++;
      else genders.none++;
    });
    const coverage = videoDuration > 0 ? Math.min(100, (spoken / videoDuration) * 100) : 0;
    return { total: rows.length, dubbed, empty: rows.length - dubbed, chars, spoken, voices: voices.size, genders, coverage };
  }, [rows, videoDuration]);

  const openPath = (path: string) => {
    onOpenPath(path);
    onClose();
  };

  const bookmarkCurrent = () => {
    if (!currentPath) return notify("Save or open a project first", "warning");
    setBookmarks(addBookmark(currentPath, currentName || currentPath, bmNote.trim()));
    setBmNote("");
    notify("Bookmarked current project", "success");
  };

  const Row = ({
    name, sub, onOpen, onRemove, right,
  }: { name: string; sub: string; onOpen: () => void; onRemove: () => void; right?: string }) => (
    <div className="panel p-2 flex items-center gap-2 hover:bg-bg-hover">
      <button className="flex-1 min-w-0 text-left" onClick={onOpen}>
        <div className="text-sm text-txt truncate">{name}</div>
        <div className="text-[10px] text-txt-faint font-mono truncate">{sub}</div>
      </button>
      {right && <span className="text-[10px] text-txt-faint shrink-0">{right}</span>}
      <button className="text-txt-faint hover:text-danger text-xs shrink-0" onClick={onRemove} title="Remove">✕</button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="panel w-[820px] max-w-full max-h-[90vh] flex flex-col shadow-panel">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/10 to-transparent">
          <div>
            <h2 className="text-base font-semibold text-txt">🗃 Project Manager</h2>
            <p className="text-xs text-txt-faint">
              {currentName ? `Current: ${currentName}` : "No project loaded"}
            </p>
          </div>
          <button className="text-txt-muted hover:text-txt text-lg" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 flex min-h-0">
          <nav className="w-52 shrink-0 border-r border-border overflow-auto p-2 space-y-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-left transition-colors ${
                  tab === t.id ? "bg-accent/15 text-accent" : "text-txt-muted hover:text-txt hover:bg-bg-hover"
                }`}
              >
                <span className="text-base shrink-0">{t.icon}</span>
                <span className="truncate">{t.label}</span>
                {t.id === "recovery" && autosave && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-warning shrink-0" title="Recoverable data available" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-auto p-5 min-h-0">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-2xl">{active.icon}</span>
              <div>
                <h3 className="text-base font-semibold text-txt">{active.label}</h3>
                <p className="text-xs text-txt-muted mt-0.5">{active.desc}</p>
              </div>
            </div>

            {tab === "recent" && (
              <div className="space-y-2">
                {recent.length === 0 ? (
                  <p className="text-xs text-txt-faint py-4 text-center">No recent projects yet. Open or save a .aivd project to populate this list.</p>
                ) : (
                  <>
                    <div className="flex justify-end">
                      <button className="btn-ghost text-xs" onClick={() => { clearRecent(); setRecent([]); }}>Clear List</button>
                    </div>
                    {recent.map((r) => (
                      <Row
                        key={r.path}
                        name={r.name}
                        sub={r.path}
                        right={`${r.rowCount} rows · ${fmtWhen(r.openedAt)}`}
                        onOpen={() => openPath(r.path)}
                        onRemove={() => setRecent(removeRecent(r.path))}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {tab === "bookmarks" && (
              <div className="space-y-3">
                <div className="panel p-3 space-y-2">
                  <div className="text-xs text-txt-muted">Bookmark the current project</div>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-xs"
                      placeholder="Optional note…"
                      value={bmNote}
                      onChange={(e) => setBmNote(e.target.value)}
                    />
                    <button className="btn-primary" onClick={bookmarkCurrent} disabled={!currentPath}>⭐ Bookmark</button>
                  </div>
                </div>
                {bookmarks.length === 0 ? (
                  <p className="text-xs text-txt-faint py-4 text-center">No bookmarks yet.</p>
                ) : (
                  <div className="space-y-2">
                    {bookmarks.map((b) => (
                      <Row
                        key={b.path}
                        name={b.name}
                        sub={b.note ? `${b.note} · ${b.path}` : b.path}
                        onOpen={() => openPath(b.path)}
                        onRemove={() => setBookmarks(removeBookmark(b.path))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "layout" && (
              <div className="space-y-3">
                <div className="panel p-3 text-xs text-txt-muted space-y-1">
                  <div>Sidebar: <span className="text-txt">{layout.sidebarCollapsed ? "collapsed" : "expanded"}</span></div>
                  <div>Video panel: <span className="text-txt">{layout.showVideo ? `shown (${layout.videoWidth}px)` : "hidden"}</span></div>
                  <div>Timeline: <span className="text-txt">{layout.showTimeline ? `shown (${layout.timelineHeight}px)` : "hidden"}</span></div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => { saveLayout(layout); setSavedLayout(layout); notify("Workspace layout saved", "success"); }}
                  >
                    Save Current Layout
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => { if (savedLayout) { onApplyLayout(savedLayout); notify("Layout restored"); } }}
                    disabled={!savedLayout}
                  >
                    Restore Saved Layout
                  </button>
                </div>
                {savedLayout && (
                  <p className="text-[10px] text-txt-faint">
                    Saved: sidebar {savedLayout.sidebarCollapsed ? "collapsed" : "expanded"}, video {savedLayout.showVideo ? `${savedLayout.videoWidth}px` : "hidden"}, timeline {savedLayout.showTimeline ? `${savedLayout.timelineHeight}px` : "hidden"}.
                  </p>
                )}
              </div>
            )}

            {tab === "stats" && (
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total rows" value={stats.total} />
                <Stat label="Dubbed" value={stats.dubbed} tone="success" />
                <Stat label="Empty" value={stats.empty} tone={stats.empty ? "warning" : undefined} />
                <Stat label="Characters" value={stats.chars.toLocaleString()} />
                <Stat label="Spoken time" value={fmtClock(stats.spoken)} />
                <Stat label="Video duration" value={fmtClock(videoDuration)} />
                <Stat label="Coverage" value={`${Math.round(stats.coverage)}%`} />
                <Stat label="Distinct voices" value={stats.voices} />
                <div className="panel p-3 col-span-2">
                  <div className="label mb-1">Gender split</div>
                  <div className="flex gap-3 text-xs text-txt-muted">
                    <span>♂ Male: <span className="text-txt">{stats.genders.Male}</span></span>
                    <span>♀ Female: <span className="text-txt">{stats.genders.Female}</span></span>
                    <span>? Unknown: <span className="text-txt">{stats.genders.Unknown}</span></span>
                    <span>— Unset: <span className="text-txt">{stats.genders.none}</span></span>
                  </div>
                </div>
              </div>
            )}

            {tab === "recovery" && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-txt">
                  <input type="checkbox" className="accent-accent" checked={autosaveEnabled} onChange={(e) => onToggleAutosave(e.target.checked)} />
                  Enable autosave (every 60s to local storage)
                </label>
                {autosave ? (
                  <div className="panel p-3 space-y-2 border-warning/30">
                    <div className="text-sm text-warning">Recoverable snapshot found</div>
                    <div className="text-xs text-txt-muted space-y-0.5">
                      <div>Saved: {fmtWhen(autosave.savedAt)}</div>
                      <div>Rows: {autosave.rows.length}</div>
                      <div className="font-mono truncate">Video: {autosave.videoName || "none"}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={() => { onRecover(autosave); onClose(); }}>Restore</button>
                      <button className="btn-ghost" onClick={() => { clearAutosave(); setAutosave(null); notify("Autosave discarded"); }}>Discard</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-txt-faint py-2">No autosave snapshot available yet.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-txt";
  return (
    <div className="panel p-3">
      <div className="label">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
