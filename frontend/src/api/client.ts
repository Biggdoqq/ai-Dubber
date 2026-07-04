import type { Subtitle, Job, Voice, AppSettings } from "./types";

const BASE = "";

async function jsonFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  ping: () => jsonFetch<{ pong: boolean }>("/api/ping"),

  health: () =>
    jsonFetch<{ status: string; ffmpeg: boolean; ffmpeg_path: string }>(
      "/api/system/health"
    ),

  voices: () => jsonFetch<{ edge: Voice[]; voxcpm: Voice[] }>("/api/system/voices"),

  // ---- media ----
  uploadMedia: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(BASE + "/api/media/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ path: string; name: string; duration: number }>;
  },
  uploadReferenceVoice: async (file: File, onProgress?: (pct: number) => void) => {
    return new Promise<{ path: string; name: string; metadata: any }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", BASE + "/api/media/upload-reference-voice");
      
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };
      }
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (err) {
            reject(new Error("Invalid response JSON"));
          }
        } else {
          reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
        }
      };
      
      xhr.onerror = () => reject(new Error("Network upload error"));
      
      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    });
  },
  deleteReferenceVoice: (path: string) =>
    jsonFetch<{ deleted: boolean; path: string }>(
      `/api/media/delete-reference-voice?path=${encodeURIComponent(path)}`,
      { method: "DELETE" }
    ),
  streamUrl: (path: string) => `/api/media/stream?path=${encodeURIComponent(path)}`,
  referenceVoiceStreamUrl: (path: string) => `/api/media/reference-voice-stream?path=${encodeURIComponent(path)}`,
  waveform: (path: string, buckets = 800) =>
    jsonFetch<{ peaks: number[]; buckets: number }>(
      `/api/media/waveform?path=${encodeURIComponent(path)}&buckets=${buckets}`
    ),

  // ---- srt ----
  parseSrt: (content: string) =>
    jsonFetch<{ rows: Subtitle[]; count: number }>("/api/srt/parse", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  buildSrt: async (rows: Subtitle[]) => {
    const res = await fetch(BASE + "/api/srt/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    return res.text();
  },

  // ---- subtitle editing ----
  autoSpeed: (subtitles: Subtitle[], language: string, min_speed = 0.9, max_speed = 1.2) =>
    jsonFetch<{ subtitles: Subtitle[] }>("/api/subtitles/auto-speed", {
      method: "POST",
      body: JSON.stringify({ subtitles, language, min_speed, max_speed }),
    }),
  mergeRows: (subtitles: Subtitle[], indices: number[]) =>
    jsonFetch<{ subtitles: Subtitle[] }>("/api/subtitles/merge", {
      method: "POST",
      body: JSON.stringify({ subtitles, indices }),
    }),
  shiftTimes: (subtitles: Subtitle[], indices: number[], offset: number) =>
    jsonFetch<{ subtitles: Subtitle[] }>("/api/subtitles/shift", {
      method: "POST",
      body: JSON.stringify({ subtitles, indices, offset }),
    }),
  autoSplit: (subtitles: Subtitle[], max_chars = 60) =>
    jsonFetch<{ subtitles: Subtitle[] }>("/api/subtitles/auto-split", {
      method: "POST",
      body: JSON.stringify({ subtitles, max_chars }),
    }),
  autoVoice: (
    subtitles: Subtitle[],
    male_voice = "km-KH-PisethNeural",
    female_voice = "km-KH-SreymomNeural"
  ) =>
    jsonFetch<{ subtitles: Subtitle[] }>("/api/subtitles/auto-voice", {
      method: "POST",
      body: JSON.stringify({ subtitles, male_voice, female_voice }),
    }),
  cleanupSubtitles: (subtitles: Subtitle[]) =>
    jsonFetch<{ subtitles: Subtitle[] }>("/api/subtitles/cleanup", {
      method: "POST",
      body: JSON.stringify({ subtitles }),
    }),
  detectCharacters: (subtitles: Subtitle[]) =>
    jsonFetch<{ characters: string[]; counts: Record<string, number>; row_speakers: (string | null)[] }>(
      "/api/subtitles/detect-characters",
      { method: "POST", body: JSON.stringify({ subtitles }) }
    ),

  // ---- jobs (async work) ----
  getJob: (id: string) => jsonFetch<Job>(`/api/jobs/${id}`),
  cancelJob: (id: string) =>
    jsonFetch<{ cancelled: boolean }>(`/api/jobs/${id}/cancel`, { method: "POST" }),

  // ---- long-running operations (return { job_id }) ----
  transcribe: (
    path: string,
    model_size: string,
    use_gpu: boolean,
    engine: string,
    target_lang = "Khmer"
  ) =>
    jsonFetch<{ job_id: string }>("/api/transcribe", {
      method: "POST",
      body: JSON.stringify({ path, model_size, use_gpu, engine, target_lang }),
    }),
  silenceSplit: (
    path: string,
    opts: { silence_thresh?: number; min_silence?: number; min_speech?: number; max_seg?: number } = {}
  ) =>
    jsonFetch<{ job_id: string }>("/api/transcribe/silence-split", {
      method: "POST",
      body: JSON.stringify({ path, ...opts }),
    }),
  batchTranscribe: (videos: string[], model_size: string, use_gpu: boolean, max_seg = 8.0) =>
    jsonFetch<{ job_id: string }>("/api/transcribe/batch", {
      method: "POST",
      body: JSON.stringify({ videos, model_size, use_gpu, max_seg }),
    }),
  removeVocals: (video_path: string, output_path: string, use_gpu: boolean) =>
    jsonFetch<{ job_id: string }>("/api/audio/remove-vocals", {
      method: "POST",
      body: JSON.stringify({ video_path, output_path, use_gpu }),
    }),
  reduceNoise: (input_path: string, output_path: string) =>
    jsonFetch<{ job_id: string }>("/api/audio/reduce-noise", {
      method: "POST",
      body: JSON.stringify({ input_path, output_path }),
    }),
  enhanceVoice: (input_path: string, output_path: string) =>
    jsonFetch<{ job_id: string }>("/api/audio/enhance-voice", {
      method: "POST",
      body: JSON.stringify({ input_path, output_path }),
    }),
  listAudioEffects: () =>
    jsonFetch<{ effects: string[] }>("/api/audio/audio-effects"),
  applyAudioEffect: (input_path: string, output_path: string, effect_name: string) =>
    jsonFetch<{ job_id: string }>("/api/audio/audio-effect", {
      method: "POST",
      body: JSON.stringify({ input_path, output_path, effect_name }),
    }),
  backgroundAudio: (
    video_path: string,
    bg_audio_path: string,
    output_path: string,
    opts: { bg_volume?: number; main_volume?: number; loop_bg?: boolean } = {}
  ) =>
    jsonFetch<{ job_id: string }>("/api/audio/background-audio", {
      method: "POST",
      body: JSON.stringify({ video_path, bg_audio_path, output_path, ...opts }),
    }),
  analyzeGender: (audio_path: string, rows: { start: number; end: number }[]) =>
    jsonFetch<{ job_id: string }>("/api/audio/analyze-gender", {
      method: "POST",
      body: JSON.stringify({ audio_path, rows }),
    }),
  translate: (
    rows: { row_index: number; text: string; duration: number }[],
    source_lang: string,
    target_lang: string,
    engine: string,
    custom_instructions = ""
  ) =>
    jsonFetch<{ job_id: string }>("/api/translate", {
      method: "POST",
      body: JSON.stringify({ rows, source_lang, target_lang, engine, custom_instructions }),
    }),
  spellCheck: (rows: { row_index: number; text: string }[]) =>
    jsonFetch<{ job_id: string }>("/api/translate/spell-check", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  // ---- audio export (.mp3 / .wav) — canonical method ----
  // exportAudio covers all export scenarios; the old exportMp3 alias was removed.
  exportAudio: (
    subtitles: Subtitle[],
    video_duration: number,
    output_path: string,
    opts: {
      dub_volume?: number;
      auto_sync_speed?: boolean;
      audio_start_offset_ms?: number;
      audio_format?: "mp3" | "wav";
    } = {}
  ) =>
    jsonFetch<{ job_id: string }>("/api/export/mp3", {
      method: "POST",
      body: JSON.stringify({ subtitles, video_duration, output_path, ...opts }),
    }),
  ttsPreviewUrl: () => "/api/tts/preview",

  // ---- video export (.mp4) ----
  exportVideo: (
    subtitles: Subtitle[],
    video_path: string,
    output_path: string,
    opts: {
      video_duration?: number;
      dub_volume?: number;
      auto_sync_speed?: boolean;
      audio_start_offset_ms?: number;
      burn_subtitles?: boolean;
      quality?: string;
      use_gpu?: boolean;
      subtitle_font_size?: number;
      video_encoder?: string;
    } = {}
  ) =>
    jsonFetch<{ job_id: string }>("/api/export/video", {
      method: "POST",
      body: JSON.stringify({ subtitles, video_path, output_path, ...opts }),
    }),

  // ---- video effects (reuse legacy Effect.py) ----
  listEffects: () =>
    jsonFetch<{
      presets: string[];
      ffmpeg: Record<string, { name: string; min?: number; max?: number; default?: number; unit?: string }>;
    }>("/api/effects"),
  applyEffect: (input_video: string, output_video: string, effect_name: string, value = 1.0) =>
    jsonFetch<{ job_id: string }>("/api/effects/apply", {
      method: "POST",
      body: JSON.stringify({ input_video, output_video, effect_name, value }),
    }),
  applyOverlays: (input_video: string, output_video: string, config: Record<string, unknown>) =>
    jsonFetch<{ job_id: string }>("/api/effects/overlays", {
      method: "POST",
      body: JSON.stringify({ input_video, output_video, config }),
    }),

  // ---- batch video export + video→mp3 ----
  batchExportVideo: (
    items: {
      subtitles: Subtitle[];
      video_path: string;
      output_path: string;
      video_duration?: number;
      burn_subtitles?: boolean;
      quality?: string;
      use_gpu?: boolean;
    }[]
  ) =>
    jsonFetch<{ job_id: string }>("/api/batch/export-video", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  batchVideoToMp3: (videos: string[], output_folder: string) =>
    jsonFetch<{ job_id: string }>("/api/batch/video-to-mp3", {
      method: "POST",
      body: JSON.stringify({ videos, output_folder }),
    }),
  batchTranslateSrt: (
    files: string[],
    source_lang: string,
    target_lang: string,
    engine: string
  ) =>
    jsonFetch<{ job_id: string }>("/api/batch/translate-srt", {
      method: "POST",
      body: JSON.stringify({ files, source_lang, target_lang, engine }),
    }),
  batchFolderExport: (
    folder: string,
    opts: {
      mode?: "video" | "mp3";
      dub_volume?: number;
      auto_sync_speed?: boolean;
      burn_subtitles?: boolean;
      quality?: string;
      use_gpu?: boolean;
    } = {}
  ) =>
    jsonFetch<{ job_id: string }>("/api/batch/folder-export", {
      method: "POST",
      body: JSON.stringify({ folder, ...opts }),
    }),

  // ---- gameplay recap ----
  recapOptions: () =>
    jsonFetch<{ genres: string[]; durations: string[] }>("/api/recap/options"),
  recapGenerateScript: (
    video_path: string,
    opts: { genre?: string; duration?: string; target_language?: string; analysis_mode?: string } = {}
  ) =>
    jsonFetch<{ job_id: string }>("/api/recap/generate-script", {
      method: "POST",
      body: JSON.stringify({ video_path, ...opts }),
    }),
  recapExport: (
    video_path: string,
    script: string,
    output_path: string,
    opts: { voice?: string; burn_subtitles?: boolean } = {}
  ) =>
    jsonFetch<{ job_id: string }>("/api/recap/export", {
      method: "POST",
      body: JSON.stringify({ video_path, script, output_path, ...opts }),
    }),

  // ---- settings ----
  getSettings: () => jsonFetch<AppSettings>("/api/settings"),
  updateSettings: (values: Record<string, unknown>) =>
    jsonFetch<AppSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ values }),
    }),
  getCharacters: () => jsonFetch<Record<string, { gender: string; ref_wav: string }>>(
    "/api/settings/characters"
  ),
  saveCharacters: (profiles: Record<string, { gender: string; ref_wav: string }>) =>
    jsonFetch<Record<string, { gender: string; ref_wav: string }>>(
      "/api/settings/characters",
      { method: "PUT", body: JSON.stringify({ profiles }) }
    ),

  // ---- projects (.aivd, server-side paths) ----
  openProject: (path: string) =>
    jsonFetch<{ video: string; subtitles: Subtitle[] }>(
      `/api/projects/open?path=${encodeURIComponent(path)}`
    ),
  saveProject: (video: string, subtitles: Subtitle[], path: string) =>
    jsonFetch<{ saved: string }>(
      `/api/projects/save?path=${encodeURIComponent(path)}`,
      { method: "POST", body: JSON.stringify({ video, subtitles }) }
    ),

  // ---- license + key generator ----
  licenseMachineId: () =>
    jsonFetch<{ machine_id: string; formatted: string }>("/api/license/machine-id"),
  licenseStatus: () =>
    jsonFetch<{
      activated: boolean;
      expiry: string | null;
      remaining_days: number | null;
      telegram_user: string;
      duration_label: string | null;
    }>("/api/license/status"),
  licenseValidate: (key: string) =>
    jsonFetch<{ valid: boolean; label: string; expiry: string | null }>("/api/license/validate", {
      method: "POST",
      body: JSON.stringify({ key }),
    }),
  licenseActivate: (key: string, telegram_user: string) =>
    jsonFetch<{ activated: boolean }>("/api/license/activate", {
      method: "POST",
      body: JSON.stringify({ key, telegram_user }),
    }),
  licenseDeactivate: () =>
    jsonFetch<{ activated: boolean }>("/api/license/deactivate", { method: "POST" }),
  generateKey: (machine_id: string, days: number, months: number, years: number) =>
    jsonFetch<{ key: string; label: string; expiry: string }>("/api/license/generate-key", {
      method: "POST",
      body: JSON.stringify({ machine_id, days, months, years }),
    }),

  // ---- model + download manager ----
  listModels: () =>
    jsonFetch<{
      models_dir: string;
      models: {
        key: string;
        label: string;
        note: string;
        path: string;
        installed: boolean;
        size_mb: number;
        downloadable: boolean;
      }[];
    }>("/api/models"),
  downloadModel: (key: string) =>
    jsonFetch<{ job_id: string }>("/api/models/download", {
      method: "POST",
      body: JSON.stringify({ key }),
    }),
  deleteModel: (key: string) =>
    jsonFetch<{ deleted: string }>(`/api/models/${encodeURIComponent(key)}`, { method: "DELETE" }),

  // ---- update manager ----
  checkUpdate: (update_url?: string) =>
    jsonFetch<{
      has_update: boolean;
      current_version: string;
      version: string;
      url: string;
      changelog: string;
    }>("/api/update/check", {
      method: "POST",
      body: JSON.stringify({ update_url: update_url ?? null }),
    }),
  downloadUpdate: (download_url: string) =>
    jsonFetch<{ job_id: string }>("/api/update/download", {
      method: "POST",
      body: JSON.stringify({ download_url }),
    }),

  // ---- gpu + cache manager ----
  gpuInfo: () =>
    jsonFetch<{
      available: boolean;
      device_name: string | null;
      device_count: number;
      cuda_version: string | null;
      torch_version: string | null;
      encoders: string[];
      worker_python: string;
      error?: string;
    }>("/api/system/gpu"),
  cacheInfo: () =>
    jsonFetch<{
      cache_dir: string;
      total_mb: number;
      entries: { name: string; is_dir: boolean; size_mb: number }[];
    }>("/api/system/cache"),
  clearCache: (target?: string) =>
    jsonFetch<{ cleared: string[]; freed_mb: number }>("/api/system/cache/clear", {
      method: "POST",
      body: JSON.stringify({ target: target ?? null }),
    }),

  // ---- diagnostics / logs / debug ----
  diagnostics: () => jsonFetch<Record<string, unknown>>("/api/diagnostics"),
  getLogs: (limit = 200, level?: string) =>
    jsonFetch<{ logs: { time: string; level: string; logger: string; message: string }[] }>(
      `/api/diagnostics/logs?limit=${limit}${level ? `&level=${level}` : ""}`
    ),
  clearLogs: () => jsonFetch<{ cleared: boolean }>("/api/diagnostics/logs/clear", { method: "POST" }),

  // ---- batch import/export ----
  batchImportSrt: (folder: string) =>
    jsonFetch<{ job_id: string }>("/api/batch/import-srt", {
      method: "POST",
      body: JSON.stringify({ folder }),
    }),
  batchExportMp3: (
    items: {
      subtitles: Subtitle[];
      video_duration: number;
      output_path: string;
      dub_volume?: number;
      auto_sync_speed?: boolean;
    }[]
  ) =>
    jsonFetch<{ job_id: string }>("/api/batch/export-mp3", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
};

// Poll a job until terminal, calling onProgress on each tick.
export async function pollJob(
  id: string,
  onProgress: (job: Job) => void,
  intervalMs = 600
): Promise<Job> {
  while (true) {
    const job = await api.getJob(id);
    onProgress(job);
    if (["done", "error", "cancelled"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
