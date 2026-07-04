interface Props {
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / pause video"],
  ["Ctrl+N", "New project"],
  ["Ctrl+O", "Open project"],
  ["Ctrl+S", "Save project"],
  ["Ctrl+F", "Find & replace"],
  ["Ctrl+T", "Transcribe video"],
  ["Ctrl+E", "Export MP3"],
  ["Delete", "Delete selected row(s)"],
  ["Esc", "Close dialog"],
];

export default function ShortcutsDialog({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="panel w-[440px]">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-txt">Keyboard Shortcuts</h2>
          <button className="text-txt-muted hover:text-txt" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-4">
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUTS.map(([key, desc]) => (
                <tr key={key} className="border-b border-border-muted last:border-0">
                  <td className="py-1.5 pr-4">
                    <kbd className="font-mono text-xs bg-bg-elevated border border-border rounded px-1.5 py-0.5 text-txt">
                      {key}
                    </kbd>
                  </td>
                  <td className="py-1.5 text-txt-muted">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
