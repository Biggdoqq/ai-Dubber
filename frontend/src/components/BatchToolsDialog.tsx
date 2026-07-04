import { useState } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";

interface Props {
  onClose: () => void;
  notify: (msg: string) => void;
}

type ImportResult = { folder: string; files: { name: string; ok: boolean; count?: number; error?: string }[] };
type BatchResult = { ok: number; fail: number; output_folder?: string };

export default function BatchToolsDialog({ onClose, notify }: Props) {
  const [videoPaths, setVideoPaths] = useState("");
  const [outputFolder, setOutputFolder] = useState("");
  const [srtFolder, setSrtFolder] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const job = useJob();
  const busy = running !== null;

  const Spinner = ({ id }: { id: string }) =>
    running === id ? <span className="text-xs text-accent ml-2">{job.job?.progress ?? 0}%</span> : null;

  const videoToMp3 = async () => {
    const videos = videoPaths.split("\n").map((p) => p.trim()).filter(Boolean);
    if (videos.length === 0) return notify("Enter one video path per line");
    if (!outputFolder.trim()) return notify("Enter an output folder");
    setRunning("v2m");
    const final = await job.start(() => api.batchVideoToMp3(videos, outputFolder.trim()));
    setRunning(null);
    if (final.status === "done") {
      const r = final.result as BatchResult;
      notify(`Extracted ${r.ok} MP3(s), ${r.fail} failed → ${r.output_folder}`);
    } else {
      notify(`Batch video→MP3 failed: ${final.error?.split("\n")[0] || ""}`);
    }
  };

  const importSrt = async () => {
    if (!srtFolder.trim()) return notify("Enter a folder path");
    setRunning("import");
    const final = await job.start(() => api.batchImportSrt(srtFolder.trim()));
    setRunning(null);
    if (final.status === "done") {
      const r = final.result as ImportResult;
      setImportResult(r);
      const ok = r.files.filter((f) => f.ok).length;
      notify(`Parsed ${ok}/${r.files.length} SRT file(s)`);
    } else {
      notify(`Batch import failed: ${final.error?.split("\n")[0] || ""}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="panel w-[600px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-txt">Batch Tools</h2>
          <button className="text-txt-muted hover:text-txt" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-auto flex-1">
          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">Batch Video → MP3</h3>
            <p className="text-xs text-txt-muted">
              Bulk-extract audio from videos. One absolute video path per line.
            </p>
            <textarea
              className="input w-full h-24 resize-none font-mono text-xs"
              placeholder={"C:\\videos\\ep1.mp4\nC:\\videos\\ep2.mp4"}
              value={videoPaths}
              onChange={(e) => setVideoPaths(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="label whitespace-nowrap">Output folder</span>
              <input
                className="input flex-1 font-mono text-xs"
                placeholder="C:\\videos\\mp3_out"
                value={outputFolder}
                onChange={(e) => setOutputFolder(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={videoToMp3} disabled={busy}>
                Extract MP3s<Spinner id="v2m" />
              </button>
            </div>
          </section>

          <section className="panel p-3 space-y-2">
            <h3 className="text-sm font-medium text-txt">Batch Import SRT (Folder)</h3>
            <p className="text-xs text-txt-muted">
              Scan a folder and parse every <span className="font-mono">.srt</span> inside.
            </p>
            <div className="flex items-center gap-2">
              <span className="label whitespace-nowrap">SRT folder</span>
              <input
                className="input flex-1 font-mono text-xs"
                placeholder="C:\\subtitles"
                value={srtFolder}
                onChange={(e) => setSrtFolder(e.target.value)}
              />
              <button className="btn-ghost" onClick={importSrt} disabled={busy}>
                Scan<Spinner id="import" />
              </button>
            </div>
            {importResult && (
              <div className="panel p-2 text-xs max-h-40 overflow-auto">
                {importResult.files.length === 0 ? (
                  <div className="text-txt-faint">No .srt files found in {importResult.folder}</div>
                ) : (
                  importResult.files.map((f, i) => (
                    <div key={i} className="flex justify-between gap-2 py-0.5">
                      <span className="text-txt truncate">{f.name}</span>
                      <span className={f.ok ? "text-success" : "text-danger"}>
                        {f.ok ? `${f.count} rows` : f.error || "error"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-txt-muted min-h-[1rem]">
            {busy ? job.job?.message || "Working…" : ""}
          </span>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
