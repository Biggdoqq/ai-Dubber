export function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function fmtClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function parseTime(str: string): number {
  const m = str.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (m) {
    const [, h, mn, s, ms] = m;
    return +h * 3600 + +mn * 60 + +s + +ms.padEnd(3, "0") / 1000;
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}
