export interface Subtitle {
  start: number;
  end: number;
  text: string;
  pitch: number;
  speed: number;
  volume: number;
  voice: string;
  echo: number;
  gender?: string | null;
  emotion?: string | null;
  start_str?: string;
  end_str?: string;
  // Client-side editor state (backend ignores these extra fields).
  locked?: boolean;
  notes?: string;
  stability?: number;
  similarity?: number;
}

export interface Job {
  id: string;
  kind: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  result: unknown;
  error: string | null;
}

export interface Voice {
  id: string;
  label: string;
  engine: string;
}

export interface AppSettings {
  language?: string;
  theme?: string;
  whisper_model_size?: string;
  use_gemini?: boolean;
  use_groq?: boolean;
  use_nllb_translate?: boolean;
  gemini_api_key_set?: boolean;
  groq_api_key_set?: boolean;
  [key: string]: unknown;
}
