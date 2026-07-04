import type { Subtitle } from "../api/types";

const RECENT_KEY = "pm_recent";
const BOOKMARKS_KEY = "pm_bookmarks";
const LAYOUT_KEY = "pm_layout";
const AUTOSAVE_KEY = "pm_autosave";

const RECENT_LIMIT = 15;

export interface RecentProject {
  path: string;
  name: string;
  openedAt: number;
  rowCount: number;
}

export interface Bookmark {
  path: string;
  name: string;
  note: string;
  addedAt: number;
}

export interface WorkspaceLayout {
  sidebarCollapsed: boolean;
  videoWidth: number;
  timelineHeight: number;
  showVideo: boolean;
  showTimeline: boolean;
}

export interface AutosaveSnapshot {
  video: string | null;
  videoName: string | null;
  videoDuration: number;
  rows: Subtitle[];
  savedAt: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / unavailable — non-fatal */
  }
}

// ---- recent projects ----
export const getRecent = (): RecentProject[] => read<RecentProject[]>(RECENT_KEY, []);

export function recordRecent(path: string, name: string, rowCount: number): RecentProject[] {
  const entry: RecentProject = { path, name, openedAt: Date.now(), rowCount };
  const next = [entry, ...getRecent().filter((r) => r.path !== path)].slice(0, RECENT_LIMIT);
  write(RECENT_KEY, next);
  return next;
}

export function removeRecent(path: string): RecentProject[] {
  const next = getRecent().filter((r) => r.path !== path);
  write(RECENT_KEY, next);
  return next;
}

export function clearRecent(): void {
  write(RECENT_KEY, []);
}

// ---- bookmarks ----
export const getBookmarks = (): Bookmark[] => read<Bookmark[]>(BOOKMARKS_KEY, []);

export function addBookmark(path: string, name: string, note = ""): Bookmark[] {
  if (getBookmarks().some((b) => b.path === path)) return getBookmarks();
  const next = [...getBookmarks(), { path, name, note, addedAt: Date.now() }];
  write(BOOKMARKS_KEY, next);
  return next;
}

export function removeBookmark(path: string): Bookmark[] {
  const next = getBookmarks().filter((b) => b.path !== path);
  write(BOOKMARKS_KEY, next);
  return next;
}

// ---- workspace layout ----
export const getLayout = (): WorkspaceLayout | null => read<WorkspaceLayout | null>(LAYOUT_KEY, null);

export function saveLayout(layout: WorkspaceLayout): void {
  write(LAYOUT_KEY, layout);
}

// ---- autosave / recovery ----
export const getAutosave = (): AutosaveSnapshot | null =>
  read<AutosaveSnapshot | null>(AUTOSAVE_KEY, null);

export function saveAutosave(snapshot: AutosaveSnapshot): void {
  write(AUTOSAVE_KEY, snapshot);
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* non-fatal */
  }
}
