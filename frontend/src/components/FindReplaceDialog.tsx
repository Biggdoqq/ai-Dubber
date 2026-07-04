import { useState } from "react";

interface Props {
  onClose: () => void;
  onReplaceAll: (find: string, replace: string, matchCase: boolean) => number;
}

export default function FindReplaceDialog({ onClose, onReplaceAll }: Props) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = () => {
    if (!find) return;
    const n = onReplaceAll(find, replace, matchCase);
    setResult(`Replaced ${n} occurrence${n === 1 ? "" : "s"}`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="panel w-[440px]">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-txt">Find &amp; Replace</h2>
          <button className="text-txt-muted hover:text-txt" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="label block mb-1">Find</label>
            <input
              autoFocus
              className="input w-full"
              value={find}
              onChange={(e) => {
                setFind(e.target.value);
                setResult(null);
              }}
            />
          </div>
          <div>
            <label className="label block mb-1">Replace with</label>
            <input
              className="input w-full"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-txt">
            <input
              type="checkbox"
              className="accent-accent"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
            />
            Match case
          </label>
          {result && <p className="text-xs text-success">{result}</p>}
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={run} disabled={!find}>
            Replace All
          </button>
        </div>
      </div>
    </div>
  );
}
