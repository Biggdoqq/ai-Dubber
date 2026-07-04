import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useJob } from "../hooks/useJob";
import Spinner from "./Spinner";

interface Props {
  onClose?: () => void;
  notify: (msg: string) => void;
  inline?: boolean;
}

type Tab = "gpu" | "models" | "update" | "cache" | "license" | "keygen" | "logs" | "diagnostics";

const TABS: { id: Tab; icon: string; label: string; desc: string }[] = [
  { id: "gpu", icon: "🖥", label: "GPU Manager", desc: "Hardware acceleration status and encoder availability." },
  { id: "models", icon: "📦", label: "Model Manager", desc: "Inspect, download, and remove local ML models." },
  { id: "update", icon: "⬇", label: "Download Manager", desc: "Check for and download application updates." },
  { id: "cache", icon: "🗑", label: "Cache Manager", desc: "Review and clear the working cache directory." },
  { id: "license", icon: "🔑", label: "License Manager", desc: "Activate, view, and manage your license." },
  { id: "keygen", icon: "🛠", label: "Key Generator", desc: "Admin tool to generate machine-locked keys." },
  { id: "logs", icon: "📄", label: "Log Viewer", desc: "Live application logs with level filtering." },
  { id: "diagnostics", icon: "🩺", label: "Diagnostics", desc: "System info snapshot for troubleshooting." },
];

export default function UtilitiesDialog({ onClose, notify, inline = false }: Props) {
  const [tab, setTab] = useState<Tab>("gpu");
  const active = TABS.find((t) => t.id === tab)!;

  const innerContent = (
    <div className="flex-1 flex min-h-0">
      
      {/* sidebar features navigation */}
      <nav className="w-56 shrink-0 border-r border-border/40 overflow-y-auto p-2.5 space-y-1 bg-bg/15">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-left transition-all ${
              tab === t.id
                ? "bg-accent/15 text-accent font-semibold shadow-sm border-l-2 border-accent"
                : "text-txt-muted hover:text-txt hover:bg-bg-hover/20"
            }`}
          >
            <span className="text-sm shrink-0">{t.icon}</span>
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* content */}
      <div className="flex-1 overflow-auto p-6 min-h-0 flex flex-col justify-between">
        <div className="space-y-4 flex-1">
          <div className="flex items-start gap-3 border-b border-border/30 pb-3 shrink-0">
            <span className="text-2xl">{active.icon}</span>
            <div>
              <h3 className="text-sm font-bold text-txt">{active.label}</h3>
              <p className="text-xs text-txt-faint font-semibold mt-0.5 max-w-lg leading-relaxed">{active.desc}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {tab === "license" && <LicensePanel notify={notify} />}
            {tab === "keygen" && <KeyGenPanel notify={notify} />}
            {tab === "models" && <ModelsPanel notify={notify} />}
            {tab === "gpu" && <GpuPanel notify={notify} />}
            {tab === "cache" && <CachePanel notify={notify} />}
            {tab === "logs" && <LogViewerPanel notify={notify} />}
            {tab === "update" && <UpdatePanel notify={notify} />}
            {tab === "diagnostics" && <DiagnosticsPanel notify={notify} />}
          </div>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-transparent text-xs h-full w-full overflow-hidden">
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="panel w-[900px] max-w-full max-h-[92vh] flex flex-col shadow-2xl border border-border/80 bg-bg-panel/95 rounded-xl">
        
        {/* dialog header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/10 to-transparent shrink-0">
          <div>
            <h2 className="text-sm font-bold text-txt flex items-center gap-1.5">
              <span>🧰</span> Utilities Center
            </h2>
            <p className="text-[10px] text-txt-faint uppercase font-bold mt-0.5">System diagnostic tools, licensing registers, and models catalog</p>
          </div>
          {onClose && <button className="text-txt-faint hover:text-txt text-lg transition-colors" onClick={onClose}>✕</button>}
        </div>

        {innerContent}

        {onClose && (
          <div className="px-5 py-3 border-t border-border flex justify-end shrink-0 bg-bg/25 text-xs">
            <button className="btn-ghost px-4 py-1.5 rounded border border-border/60 text-xs text-txt hover:bg-bg-hover" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LicensePanel({ notify }: { notify: (m: string) => void }) {
  const [machineId, setMachineId] = useState("");
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.licenseStatus>> | null>(null);
  const [key, setKey] = useState("");
  const [telegram, setTelegram] = useState("");
  const [check, setCheck] = useState<Awaited<ReturnType<typeof api.licenseValidate>> | null>(null);

  const refresh = () => {
    api.licenseMachineId().then((r) => setMachineId(r.formatted)).catch(() => {});
    api.licenseStatus().then(setStatus).catch(() => {});
  };
  useEffect(refresh, []);

  const onKeyChange = (v: string) => {
    setKey(v);
    setCheck(null);
    if (v.startsWith("HG-") && v.length > 30) {
      api.licenseValidate(v).then(setCheck).catch(() => {});
    }
  };

  const activate = async () => {
    const res = await api.licenseActivate(key, telegram).catch(() => null);
    if (res?.activated) {
      notify("License activated");
      refresh();
      setKey("");
    } else {
      notify("Activation failed — key not valid for this machine");
    }
  };

  const deactivate = async () => {
    await api.licenseDeactivate().catch(() => {});
    notify("License deactivated");
    refresh();
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">This Machine ID</label>
        <div className="flex gap-2">
          <input className="input flex-1 font-mono py-1 px-2.5 text-xs bg-bg-elevated/40" value={machineId} readOnly />
          <button
            className="btn-ghost py-1 px-3 border border-border/50 rounded text-[11px]"
            onClick={() => {
              navigator.clipboard.writeText(machineId);
              notify("Machine ID copied");
            }}
          >
            Copy
          </button>
        </div>
        <p className="text-[10px] text-txt-faint mt-1.5">Send this to the license owner to receive an activation key.</p>
      </div>

      <div className="panel p-3.5 bg-bg/25 text-xs space-y-1.5 rounded-lg border border-border/30">
        <div className="flex items-center justify-between">
          <span className="font-bold text-txt-muted uppercase text-[10px]">License status</span>
          <span className={`font-bold uppercase text-[10px] ${status?.activated ? "text-success" : "text-danger"}`}>
            {status?.activated ? "Activated" : "Not activated"}
          </span>
        </div>
        {status?.activated && (
          <div className="mt-1 space-y-1 text-txt-muted font-mono text-[11px]">
            <div>Plan: {status.duration_label || "—"}</div>
            <div>Expiry: {status.expiry || "—"}</div>
            {status.remaining_days != null && status.remaining_days >= 0 && (
              <div>Remaining: {status.remaining_days} day(s)</div>
            )}
            {status.telegram_user && <div>Telegram: @{status.telegram_user}</div>}
          </div>
        )}
      </div>

      <div>
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Activation Key</label>
        <input
          className="input w-full font-mono py-1 px-2.5 text-xs bg-bg-elevated/40"
          placeholder="HG-…"
          value={key}
          onChange={(e) => onKeyChange(e.target.value)}
        />
        {check && (
          <p className={`text-[10px] font-bold mt-1 ${check.valid ? "text-success" : "text-danger"}`}>
            {check.valid ? `Valid — ${check.label}${check.expiry ? ` (until ${check.expiry})` : ""}` : "Invalid key for this machine"}
          </p>
        )}
      </div>
      <div>
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Telegram username (optional)</label>
        <input
          className="input w-full py-1 px-2.5 text-xs bg-bg-elevated/40"
          placeholder="@HeangDigital"
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        {status?.activated && (
          <button className="btn-ghost py-1 px-4 border border-border/50 rounded hover:bg-bg-hover" onClick={deactivate}>
            Deactivate
          </button>
        )}
        <button className="btn-primary py-1 px-4 rounded font-semibold" onClick={activate} disabled={!key}>
          Activate
        </button>
      </div>
    </div>
  );
}

function KeyGenPanel({ notify }: { notify: (m: string) => void }) {
  const [mid, setMid] = useState("");
  const [days, setDays] = useState(0);
  const [months, setMonths] = useState(0);
  const [years, setYears] = useState(1);
  const [result, setResult] = useState("");

  const preset = (d: number, m: number, y: number) => {
    setDays(d);
    setMonths(m);
    setYears(y);
  };

  const generate = async () => {
    try {
      const res = await api.generateKey(mid, days, months, years);
      setResult(res.key);
      notify(`Key generated (${res.label})`);
    } catch (e) {
      notify(`${e}`);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <p className="text-[10px] text-txt-faint font-semibold uppercase">
        Admin keygen terminal — generate machine-locked license keys.
      </p>
      <div>
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Target Machine ID</label>
        <input
          className="input w-full font-mono py-1 px-2.5 bg-bg-elevated/40"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={mid}
          onChange={(e) => setMid(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Days</label>
          <input type="number" min={0} className="input w-full py-1 text-center" value={days} onChange={(e) => setDays(+e.target.value || 0)} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Months</label>
          <input type="number" min={0} className="input w-full py-1 text-center" value={months} onChange={(e) => setMonths(+e.target.value || 0)} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Years</label>
          <input type="number" min={0} className="input w-full py-1 text-center" value={years} onChange={(e) => setYears(+e.target.value || 0)} />
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {([["7 Days", 7, 0, 0], ["30 Days", 30, 0, 0], ["90 Days", 90, 0, 0], ["1 Year", 0, 0, 1], ["Lifetime", 0, 0, 0]] as [string, number, number, number][]).map(
          ([label, d, m, y]) => (
            <button key={label} className="btn-ghost py-0.5 px-2 rounded border border-border/40 text-[10px] font-bold uppercase hover:bg-bg-hover" onClick={() => preset(d, m, y)}>
              {label}
            </button>
          )
        )}
      </div>
      <button className="btn-primary w-full py-1.5 rounded font-semibold text-xs mt-1" onClick={generate} disabled={!mid}>
        Generate Key
      </button>
      {result && (
        <div className="flex gap-2 pt-2 border-t border-border/20">
          <input className="input flex-1 font-mono text-[10px] py-1 px-2.5" value={result} readOnly />
          <button
            className="btn-ghost py-1 px-3 border border-border/50 rounded text-xs"
            onClick={() => {
              navigator.clipboard.writeText(result);
              notify("Key copied");
            }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function ModelsPanel({ notify }: { notify: (m: string) => void }) {
  const [models, setModels] = useState<Awaited<ReturnType<typeof api.listModels>> | null>(null);
  const job = useJob();
  const [downloading, setDownloading] = useState<string | null>(null);

  const refresh = () => {
    api.listModels().then(setModels).catch(() => {});
  };
  useEffect(refresh, []);

  const download = async (key: string) => {
    setDownloading(key);
    const final = await job.start(() => api.downloadModel(key));
    setDownloading(null);
    notify(final.status === "done" ? "Download complete" : `Download failed: ${final.error?.split("\n")[0] || ""}`);
    refresh();
  };

  const remove = async (key: string) => {
    await api.deleteModel(key).catch(() => {});
    notify("Model removed");
    refresh();
  };

  return (
    <div className="space-y-3.5 text-xs">
      <p className="text-[10px] text-txt-faint font-semibold uppercase">Models Folder: <span className="font-mono text-txt-muted">{models?.models_dir}</span></p>
      <div className="space-y-2 max-h-[360px] overflow-y-auto">
        {models?.models.map((m) => (
          <div key={m.key} className="panel p-3 flex flex-col gap-2 bg-bg/15 rounded-lg border border-border/30">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs text-txt font-semibold flex items-center gap-1.5">
                  <span>📦 {m.label}</span>
                  {m.installed ? (
                    <span className="text-success text-[10px] font-bold">✓ {m.size_mb} MB</span>
                  ) : (
                    <span className="text-txt-faint text-[10px] uppercase font-bold">not installed</span>
                  )}
                </div>
                <div className="text-[10px] text-txt-faint truncate mt-0.5">{m.note}</div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {m.downloadable && !m.installed && (
                  <button className="btn-ghost py-1 px-3 border border-border/50 text-[10px] rounded hover:text-accent" onClick={() => download(m.key)} disabled={downloading !== null}>
                    Download
                  </button>
                )}
                {m.installed && (
                  <button className="btn-ghost py-1 px-3 border border-border/50 text-[10px] rounded hover:text-danger" onClick={() => remove(m.key)} disabled={downloading !== null}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            {downloading === m.key && (
              <div className="space-y-1.5 mt-1 border-t border-border/20 pt-2">
                <div className="h-1 bg-bg-elevated rounded overflow-hidden">
                  <div className="h-full bg-accent transition-all duration-300" style={{ width: `${job.job?.progress ?? 0}%` }} />
                </div>
                <div className="text-[9px] text-accent flex justify-between font-mono">
                  <span>{job.job?.message || "Downloading model artifacts…"}</span>
                  <span>{job.job?.progress ?? 0}%</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UpdatePanel({ notify }: { notify: (m: string) => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.checkUpdate>> | null>(null);
  const [checking, setChecking] = useState(false);
  const job = useJob();
  const [downloading, setDownloading] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      setInfo(await api.checkUpdate());
    } catch (e) {
      notify(`Update check failed: ${e}`);
    }
    setChecking(false);
  };

  const download = async () => {
    if (!info?.url) return;
    setDownloading(true);
    const final = await job.start(() => api.downloadUpdate(info.url));
    setDownloading(false);
    notify(final.status === "done" ? "Update downloaded" : "Update download failed");
  };

  return (
    <div className="space-y-3.5 text-xs">
      <button className="btn-primary py-1 px-4.5 rounded font-semibold text-xs flex items-center justify-center gap-1.5" onClick={check} disabled={checking}>
        {checking ? (
          <>
            <Spinner size={10} className="text-white" />
            <span>Checking Release Registry…</span>
          </>
        ) : (
          <span>Check for Updates</span>
        )}
      </button>
      {info && (
        <div className="panel p-3.5 bg-bg/15 text-xs space-y-2 border border-border/40 rounded-lg">
          <div className="text-txt-muted">Current Installed version: <span className="text-txt font-mono">{info.current_version}</span></div>
          <div className="text-txt-muted">Latest Server version: <span className="text-txt font-mono">{info.version || "—"}</span></div>
          {info.has_update ? (
            <div className="space-y-2 pt-2 border-t border-border/20">
              <div className="text-success font-semibold flex items-center gap-1">🟢 New Update Available</div>
              {info.changelog && (
                <pre className="text-[10px] text-txt-faint whitespace-pre-wrap mt-1 font-mono bg-bg-elevated/25 p-2 rounded max-h-24 overflow-y-auto border border-border/20">{info.changelog}</pre>
              )}
              {downloading && (
                <div className="space-y-1.5 mt-2">
                  <div className="h-1 bg-bg-elevated rounded overflow-hidden">
                    <div className="h-full bg-accent transition-all duration-300" style={{ width: `${job.job?.progress ?? 0}%` }} />
                  </div>
                  <div className="text-[9px] text-accent flex justify-between font-mono">
                    <span>{job.job?.message || "Downloading update executable package…"}</span>
                    <span>{job.job?.progress ?? 0}%</span>
                  </div>
                </div>
              )}
              <button className="btn-ghost py-1 px-3 border border-border/50 text-[10px] rounded hover:text-accent mt-2" onClick={download} disabled={downloading}>
                Download Update Package
              </button>
            </div>
          ) : (
            <div className="text-txt-faint italic font-semibold pt-1">You are currently running the latest stable release.</div>
          )}
        </div>
      )}
    </div>
  );
}

function DiagnosticsPanel({ notify }: { notify: (m: string) => void }) {
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<{ time: string; level: string; logger: string; message: string }[]>([]);

  const refresh = () => {
    api.diagnostics().then(setDiag).catch(() => {});
    api.getLogs(200).then((r) => setLogs(r.logs)).catch(() => {});
  };
  useEffect(refresh, []);

  return (
    <div className="space-y-4 text-xs">
      <div className="flex gap-2">
        <button className="btn-ghost py-1 px-3 border border-border/50 rounded hover:bg-bg-hover text-[10px] font-bold uppercase" onClick={refresh}>Refresh</button>
        <button
          className="btn-ghost py-1 px-3 border border-border/50 rounded hover:bg-bg-hover text-[10px] font-bold uppercase"
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
            notify("Diagnostics copied");
          }}
        >
          Copy Diagnostics
        </button>
        <button
          className="btn-ghost py-1 px-3 border border-danger/30 text-danger rounded hover:bg-danger/5 text-[10px] font-bold uppercase"
          onClick={() => api.clearLogs().then(refresh)}
        >
          Clear Logs
        </button>
      </div>

      <div>
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">System Profile</label>
        <pre className="panel p-3 text-[10px] font-mono text-txt-muted whitespace-pre-wrap max-h-40 overflow-auto bg-bg-elevated/25 border border-border/30 rounded-lg">
          {diag ? JSON.stringify(diag, null, 2) : "Loading diagnostics logs…"}
        </pre>
      </div>

      <div>
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Logs Ring Buffer ({logs.length})</label>
        <div className="panel p-2.5 text-[10px] font-mono max-h-40 overflow-auto bg-bg-elevated/25 border border-border/30 rounded-lg space-y-0.5">
          {logs.length === 0 ? (
            <div className="text-txt-faint py-4 text-center">No logs captured yet.</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="flex gap-2 py-0.5 border-b border-border-muted/10 last:border-0">
                <span className="text-txt-faint shrink-0">{l.time.split("T")[1] || l.time}</span>
                <span className={`w-14 shrink-0 font-bold ${l.level === "ERROR" ? "text-danger" : l.level === "WARNING" ? "text-warning" : "text-txt-muted"}`}>
                  {l.level}
                </span>
                <span className="text-txt flex-1 break-all">{l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function GpuPanel({ notify }: { notify: (m: string) => void }) {
  const [gpu, setGpu] = useState<Awaited<ReturnType<typeof api.gpuInfo>> | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    api.gpuInfo().then(setGpu).catch(() => {}).finally(() => setLoading(false));
    api.getSettings().then(setSettings).catch(() => {});
  };
  useEffect(refresh, []);

  const toggleGpuNllb = async (val: boolean) => {
    await api.updateSettings({ use_gpu_nllb: val }).catch(() => {});
    setSettings((s) => ({ ...(s || {}), use_gpu_nllb: val }));
    notify(`Offline translation GPU ${val ? "enabled" : "disabled"}`);
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between shrink-0">
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Hardware Acceleration status</label>
        <button className="btn-ghost py-1 px-2.5 border border-border/50 rounded text-[10px] font-bold uppercase hover:bg-bg-hover" onClick={refresh}>Refresh</button>
      </div>

      <div className="panel p-3.5 bg-bg-elevated/30 border border-border/50 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-txt">CUDA Toolkit (PyTorch API)</span>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${gpu?.available ? "bg-success/20 text-success" : "bg-bg-elevated text-txt-faint"}`}>
            {loading ? "probing…" : gpu?.available ? "Available" : "Not available"}
          </span>
        </div>
        {gpu?.available && (
          <div className="text-[10px] text-txt-muted space-y-1 font-mono pt-1 border-t border-border/10">
            <div>Device Name: {gpu.device_name} {gpu.device_count > 1 ? `(×${gpu.device_count})` : ""}</div>
            <div>CUDA Driver: {gpu.cuda_version || "—"}</div>
            {gpu.torch_version && <div>PyTorch version: {gpu.torch_version}</div>}
          </div>
        )}
        {gpu?.error && <div className="text-xs text-danger break-all font-mono pt-1 border-t border-border/10">{gpu.error}</div>}
      </div>

      <div className="panel p-3.5 bg-bg-elevated/30 border border-border/50 rounded-lg space-y-1.5">
        <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block">FFmpeg H.264 Encoders</label>
        <div className="text-[10px] font-mono text-txt-muted bg-bg/25 p-2 rounded border border-border/20">
          {gpu?.encoders?.length ? gpu.encoders.join(", ") : "libx264 (CPU default)"}
        </div>
        <p className="text-[10px] text-txt-faint mt-1">
          Video multiplexer checks GPU encoders (nvenc → mf → qsv) before falling back to CPU (libx264).
        </p>
      </div>

      <div className="panel p-3.5 bg-bg-elevated/30 border border-border/50 rounded-lg">
        <label className="flex items-center justify-between text-xs text-txt cursor-pointer">
          <span className="font-semibold">Use GPU for offline (NLLB) translation</span>
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!settings?.use_gpu_nllb}
            onChange={(e) => toggleGpuNllb(e.target.checked)}
          />
        </label>
        <p className="text-[10px] text-txt-faint mt-1.5">
          Toggling NLLB translation to CUDA falls back to CPU automatically if PyTorch has no GPU devices.
        </p>
      </div>
    </div>
  );
}

function CachePanel({ notify }: { notify: (m: string) => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.cacheInfo>> | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    api.cacheInfo().then(setInfo).catch(() => {});
  };
  useEffect(refresh, []);

  const clear = async (target?: string) => {
    setBusy(true);
    try {
      const r = await api.clearCache(target);
      notify(`Freed ${r.freed_mb} MB (${r.cleared.length} item(s))`);
      refresh();
    } catch (e) {
      notify(`Clear failed: ${e}`);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3.5 text-xs">
      <div className="flex items-center justify-between bg-bg-elevated/20 p-3 rounded-lg border border-border/30">
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block">Working Cache Path</label>
          <p className="text-[10px] text-txt-faint font-mono break-all mt-0.5">{info?.cache_dir}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-bold text-accent font-mono">{info?.total_mb ?? 0} MB</div>
          <button className="btn-ghost py-0.5 px-2 border border-border/40 text-[9px] font-bold uppercase rounded mt-1" onClick={refresh}>Refresh</button>
        </div>
      </div>

      <div className="flex justify-end pt-0.5">
        <button className="btn-primary py-1 px-4 text-xs font-semibold rounded" onClick={() => clear()} disabled={busy || !info?.entries.length}>
          Clear All Cache
        </button>
      </div>

      <div className="space-y-1.5 max-h-[220px] overflow-y-auto border border-border/30 rounded-lg p-2 bg-bg/10">
        {info?.entries.length === 0 ? (
          <div className="text-[10px] text-txt-faint py-4 text-center italic">Cache is empty.</div>
        ) : (
          info?.entries.map((e) => (
            <div key={e.name} className="panel p-2 flex items-center justify-between gap-3 bg-bg-elevated/20 hover:border-accent/30 border border-border/20 rounded">
              <span className="min-w-0 text-xs text-txt truncate">
                {e.is_dir ? "📁" : "📄"} {e.name}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-txt-muted font-mono">{e.size_mb} MB</span>
                <button className="btn-ghost py-0.5 px-2 border border-border/50 text-[9px] rounded font-bold uppercase" onClick={() => clear(e.name)} disabled={busy}>
                  Clear
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <p className="text-[10px] text-txt-faint leading-relaxed mt-1">
        Clears working audio chunks, scratch folders, and pipeline logs. Model libraries are never affected.
      </p>
    </div>
  );
}

function LogViewerPanel({ notify }: { notify: (m: string) => void }) {
  const [logs, setLogs] = useState<{ time: string; level: string; logger: string; message: string }[]>([]);
  const [level, setLevel] = useState("");
  const [auto, setAuto] = useState(false);

  const refresh = () => {
    api.getLogs(500, level || undefined).then((r) => setLogs(r.logs)).catch(() => {});
  };
  useEffect(refresh, [level]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [auto, level]);

  const LEVELS: [string, string][] = [
    ["", "All"], ["INFO", "Info"], ["WARNING", "Warning"], ["ERROR", "Error"],
  ];

  return (
    <div className="space-y-3.5 text-xs">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wide">Level</span>
          <select className="input py-0.5 text-xs bg-bg-elevated/40" value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-txt-muted cursor-pointer">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-accent" />
          Auto-refresh (2s)
        </label>
        <button className="btn-ghost py-0.5 px-3.5 border border-border/50 text-[10px] rounded hover:bg-bg-hover" onClick={refresh}>Refresh</button>
        <button
          className="btn-ghost py-0.5 px-3.5 border border-border/50 text-[10px] rounded hover:bg-bg-hover"
          onClick={() => {
            navigator.clipboard.writeText(logs.map((l) => `${l.time} ${l.level} ${l.message}`).join("\n"));
            notify("Logs copied");
          }}
        >
          Copy
        </button>
        <button className="btn-ghost py-0.5 px-3.5 border border-danger/30 text-danger text-[10px] rounded hover:bg-danger/5 ml-auto font-bold" onClick={() => api.clearLogs().then(refresh)}>
          Clear Logs
        </button>
      </div>

      <div className="panel p-2.5 text-[10px] font-mono max-h-[300px] overflow-auto bg-bg-elevated/25 border border-border/30 rounded-lg space-y-0.5">
        {logs.length === 0 ? (
          <div className="text-txt-faint py-4 text-center italic">No logs at this level.</div>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="flex gap-2 py-0.5 border-b border-border-muted/10 last:border-0">
              <span className="text-txt-faint shrink-0">{l.time.split("T")[1]?.split(".")[0] || l.time}</span>
              <span className={`w-14 shrink-0 font-bold ${l.level === "ERROR" ? "text-danger" : l.level === "WARNING" ? "text-warning" : "text-txt-muted"}`}>
                {l.level}
              </span>
              <span className="text-txt flex-1 break-all">{l.message}</span>
            </div>
          ))
        )}
      </div>
      <p className="text-[10px] text-txt-faint mt-1">{logs.length} entries · loaded from ring buffer.</p>
    </div>
  );
}
