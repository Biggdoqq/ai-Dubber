import { useEffect, useRef, useState, useMemo } from "react";
import { api } from "../api/client";
import type { Subtitle, Voice } from "../api/types";

type Profile = { 
  gender: string; 
  ref_wav: string; 
  voice?: string; 
  color?: string; // custom color tag
  emoji?: string; // avatar emoji
};

interface Props {
  voices?: Voice[];
  rows?: Subtitle[];
  notify: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
}

const EMOJIS = ["👤", "👩", "👨", "🤖", "🦊", "👑", "🎬", "🎙️", "⭐", "🧙", "🐱", "🐶"];

export default function CharactersPanel({ voices = [], rows = [], notify }: Props) {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [name, setName] = useState("");
  const [gender, setGender] = useState("female");
  const [voice, setVoice] = useState("");
  const [refWav, setRefWav] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [emoji, setEmoji] = useState("👤");
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const refWavInputRef = useRef<HTMLInputElement>(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [playingRef, setPlayingRef] = useState<string | null>(null);

  // Custom audio player and drag & drop states
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [audioMetadata, setAudioMetadata] = useState<{
    filename: string;
    duration: number;
    sample_rate: number;
    channels: number;
    file_size: number;
  } | null>(null);
  const [selectedCharName, setSelectedCharName] = useState<string | null>(null);

  // Time format helper
  const formatTime = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Bytes size format helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Select character to edit
  const editCharacter = (key: string, p: Profile) => {
    setSelectedCharName(key);
    setName(key);
    setGender(p.gender);
    setVoice(p.voice || "");
    setRefWav(p.ref_wav || "");
    setColor(p.color || "#8b5cf6");
    setEmoji(p.emoji || "👤");
    
    if (p.ref_wav) {
      fetch(`/api/media/probe?path=${encodeURIComponent(p.ref_wav)}`)
        .then(res => {
          if (res.ok) return res.json();
          throw new Error();
        })
        .then(data => {
          setAudioMetadata({
            filename: p.ref_wav.split(/[\/\\]/).pop() || "",
            duration: data.duration,
            sample_rate: 44100,
            channels: 2,
            file_size: 0
          });
        })
        .catch(() => {
          setAudioMetadata(null);
        });
    } else {
      setAudioMetadata(null);
    }
  };

  const handleRefWavUpload = async (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0];
    if (!file) return;
    
    // Client-side validations
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== "wav" && ext !== "mp3") {
      notify("Unsupported file type. Only .wav and .mp3 files are allowed.", "error");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      notify("File size exceeds the 100 MB limit.", "error");
      return;
    }
    
    setUploadingRef(true);
    setUploadProgress(0);
    try {
      const res = await api.uploadReferenceVoice(file, (pct) => setUploadProgress(pct));
      setRefWav(res.path);
      setAudioMetadata(res.metadata);
      notify("Reference audio uploaded successfully", "success");
    } catch (err: any) {
      notify(`Upload failed: ${err.message || err}`, "error");
    } finally {
      setUploadingRef(false);
      setUploadProgress(null);
      if (!(e instanceof File) && e.target) {
        e.target.value = "";
      }
    }
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleRefWavUpload(file);
    }
  };

  // Playback Audition controls
  const initAudio = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    const audio = new Audio(url);
    audioRef.current = audio;
    
    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };
    
    audio.onloadedmetadata = () => {
      setDuration(audio.duration);
    };
    
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    
    audio.onerror = () => {
      notify("Audio playback failed. Please make sure it is a valid, uncorrupted audio file.", "error");
      setIsPlaying(false);
    };
  };

  const handlePlayPause = () => {
    if (!audioRef.current && refWav) {
      initAudio(api.referenceVoiceStreamUrl(refWav));
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(ex => {
          notify(`Playback failed: ${ex.message}`, "error");
        });
        setIsPlaying(true);
      }
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
    }
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const deleteReferenceAudio = async () => {
    if (!refWav) return;
    if (!confirm("Are you sure you want to delete this reference audio from disk?")) return;
    
    handleStop();
    const pathToDelete = refWav;
    setRefWav("");
    setAudioMetadata(null);
    
    try {
      await api.deleteReferenceVoice(pathToDelete);
      notify("Reference audio file deleted from disk", "info");
    } catch (err) {
      notify(`Failed to delete file: ${err}`, "warning");
    }
  };

  const playReferenceSample = async (path: string) => {
    if (!path) return;
    setPlayingRef(path);
    try {
      const url = api.referenceVoiceStreamUrl(path);
      const audio = new Audio(url);
      audio.onended = () => setPlayingRef(null);
      audio.onerror = () => {
        notify("Sample playback failed. Make sure the file exists and is a valid audio format.", "error");
        setPlayingRef(null);
      };
      await audio.play();
    } catch (err) {
      notify(`Playback failed: ${err}`, "error");
      setPlayingRef(null);
    }
  };

  // Reset player when refWav changes
  useEffect(() => {
    handleStop();
    if (audioRef.current) {
      audioRef.current = null;
    }
    setCurrentTime(0);
    setDuration(0);
  }, [refWav]);

  // Cleanup audio object on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const refresh = () => {
    setLoading(true);
    api
      .getCharacters()
      .then((p) => setProfiles(p))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const persist = async (next: Record<string, Profile>) => {
    setProfiles(next);
    try {
      await api.saveCharacters(next);
    } catch (e) {
      notify(`Save failed: ${e}`, "error");
    }
  };

  const add = () => {
    const key = name.trim();
    if (!key) return notify("Enter a character name", "warning");
    persist({ ...profiles, [key]: { gender, ref_wav: refWav.trim(), voice, color, emoji } });
    setName("");
    setRefWav("");
    setVoice("");
    setEmoji("👤");
    notify(`Saved character "${key}"`, "success");
  };

  const remove = (key: string) => {
    const next = { ...profiles };
    delete next[key];
    persist(next);
    notify(`Deleted character "${key}"`, "info");
  };

  const duplicateCharacter = (key: string, p: Profile) => {
    let copyName = `${key}_copy`;
    let i = 1;
    while (profiles[copyName]) {
      copyName = `${key}_copy_${i}`;
      i++;
    }
    const next = { ...profiles, [copyName]: { ...p } };
    persist(next);
    notify(`Duplicated character to "${copyName}"`, "success");
  };

  const previewCharacter = async (key: string, p: Profile) => {
    setPreviewing(key);
    try {
      const text = `សួស្តី ខ្ញុំជាសំឡេងសាកល្បងរបស់តួអង្គ ${key}។ Hello, this is a test clip.`;
      const fallbackVoice = p.gender === "male" ? "km-KH-PisethNeural" : "km-KH-SreymomNeural";
      const payload = {
        text,
        voice: p.voice || fallbackVoice,
        speed: 1.0,
        reference_wav: p.ref_wav || undefined,
      };

      const res = await fetch(api.ttsPreviewUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => setPreviewing(null);
      await audio.play();
    } catch (e) {
      notify(`Preview failed: ${e}`, "error");
      setPreviewing(null);
    }
  };

  const exportProfiles = () => {
    try {
      const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "character_profiles.json";
      a.click();
      URL.revokeObjectURL(url);
      notify("Exported character profiles", "success");
    } catch (e) {
      notify(`Export failed: ${e}`, "error");
    }
  };

  const importProfiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const next = JSON.parse(evt.target?.result as string);
        await persist(next);
        notify("Imported character profiles successfully", "success");
      } catch (err) {
        notify(`Import failed: invalid JSON format (${err})`, "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Stats helper
  const stats = useMemo(() => {
    const map = new Map<string, { count: number; duration: number }>();
    rows.forEach((r) => {
      if (!r.voice) return;
      const cur = map.get(r.voice) || { count: 0, duration: 0 };
      cur.count += 1;
      cur.duration += Math.max(0, r.end - r.start);
      map.set(r.voice, cur);
    });
    return map;
  }, [rows]);

  // Search filtering
  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Object.entries(profiles);
    if (!q) return list;
    return list.filter(
      ([key, p]) =>
        key.toLowerCase().includes(q) ||
        p.gender.toLowerCase().includes(q) ||
        (p.voice || "").toLowerCase().includes(q)
    );
  }, [profiles, query]);

  const initials = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return trimmed.substring(0, 2).toUpperCase();
  };

  const voiceLabel = (id: string) => voices.find((v) => v.id === id)?.label ?? id;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-bg-panel/40 text-xs animate-fade-in">
      
      {/* toolbar: import / export and search */}
      <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between bg-bg/25">
        <div className="flex items-center gap-2">
          <input
            className="input py-1 px-3 text-xs w-48 rounded bg-bg-elevated/40 focus:bg-bg-elevated"
            placeholder="Search characters…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="text-[10px] text-txt-faint font-semibold uppercase">
            {filteredEntries.length} profile{filteredEntries.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            className="hidden"
            onChange={importProfiles}
          />
          <button className="btn-ghost py-1 px-2.5 rounded border border-border/60 text-xs hover:bg-bg-hover" onClick={() => fileInputRef.current?.click()}>
            📥 Import JSON
          </button>
          <button className="btn-ghost py-1 px-2.5 rounded border border-border/60 text-xs hover:bg-bg-hover" onClick={exportProfiles} disabled={Object.keys(profiles).length === 0}>
            📤 Export JSON
          </button>
        </div>
      </div>

      {/* character configuration fields editor */}
      <div className="p-4 border-b border-border/40 bg-bg/10 grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_1.5fr_1.8fr_1fr_0.8fr_auto] gap-3 items-end">
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Name</label>
          <input
            className="input w-full py-1 text-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hero"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Gender</label>
          <select className="input w-full py-1 text-xs" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Assigned Voice</label>
          <select className="input w-full py-1 text-xs" value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="">(default)</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Ref WAV path</label>
          <div className="flex items-center gap-1">
            <input
              type="file"
              accept=".wav,.mp3"
              ref={refWavInputRef}
              className="hidden"
              onChange={handleRefWavUpload}
            />
            <input
              className="input flex-1 py-1 text-xs"
              value={refWav}
              onChange={(e) => setRefWav(e.target.value)}
              placeholder="reference_voices/sample.wav"
            />
            <button
              className="btn-ghost py-1 px-2 rounded border border-border/60 text-xs bg-bg-elevated/40 hover:bg-bg-hover whitespace-nowrap h-7"
              onClick={() => refWavInputRef.current?.click()}
              disabled={uploadingRef}
              title="Upload reference voice file"
            >
              📁 {uploadingRef ? "..." : "Upload"}
            </button>
            <button
              className="btn-ghost py-1 px-2 rounded border border-border/60 text-xs bg-bg-elevated/40 hover:bg-bg-hover h-7"
              onClick={() => playReferenceSample(refWav)}
              disabled={!refWav || playingRef === refWav}
              title="Play reference voice sample"
            >
              🔊
            </button>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1">Avatar Icon</label>
          <select className="input w-full py-1 text-xs" value={emoji} onChange={(e) => setEmoji(e.target.value)}>
            {EMOJIS.map((em) => (
              <option key={em} value={em}>{em}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col items-center">
          <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wide block mb-1.5 self-start">Color</label>
          <input
            type="color"
            className="w-full h-7 rounded border border-border/60 bg-transparent cursor-pointer hover:scale-105 transition-transform"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Choose custom color"
          />
        </div>
        <button className="btn-primary py-1 px-4 h-7 text-xs font-semibold rounded" onClick={add}>
          Add / Update
        </button>
      </div>

      {/* Reference Audio Player, Metadata, and Drag & Drop Upload Zone */}
      <div className="px-4 py-2.5 border-b border-border/40 bg-bg/5 flex flex-col gap-2">
        {refWav ? (
          <div 
            className={`p-3.5 rounded-lg border transition-all ${
              isDragging 
                ? "border-accent bg-accent/10 scale-[1.01]" 
                : "border-border/60 bg-bg-elevated/20"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Audio controls */}
              <div className="flex items-center gap-3">
                <button 
                  className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center hover:scale-105 transition-transform font-bold text-xs"
                  onClick={handlePlayPause}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? "⏸️" : "▶️"}
                </button>
                <button 
                  className="w-8 h-8 rounded-full bg-bg-hover text-txt-muted flex items-center justify-center hover:bg-border/40 transition-colors font-bold text-xs"
                  onClick={handleStop}
                  title="Stop"
                  disabled={!isPlaying && currentTime === 0}
                >
                  ⏹️
                </button>
                
                {/* Time displays & Seek slider */}
                <div className="flex items-center gap-2 min-w-[200px]">
                  <span className="font-mono text-[10px] text-txt-muted min-w-[32px] text-right">
                    {formatTime(currentTime)}
                  </span>
                  <input 
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.05}
                    value={currentTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="w-32 md:w-48 accent-accent h-1 rounded bg-border cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-txt-muted min-w-[32px]">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>

              {/* Metadata Display */}
              {audioMetadata && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-txt-muted bg-bg-panel/40 px-3 py-1.5 rounded border border-border/40">
                  <span className="font-semibold text-txt">Metadata:</span>
                  <span>File: <strong className="text-txt font-mono text-[10px]">{audioMetadata.filename}</strong></span>
                  <span>Duration: <strong>{audioMetadata.duration}s</strong></span>
                  <span>Sample Rate: <strong>{audioMetadata.sample_rate} Hz</strong></span>
                  <span>Channels: <strong>{audioMetadata.channels === 1 ? "Mono" : "Stereo"}</strong></span>
                  <span>Size: <strong>{formatBytes(audioMetadata.file_size)}</strong></span>
                </div>
              )}

              {/* Actions: Replace, Delete */}
              <div className="flex items-center gap-2 self-end md:self-auto">
                <button 
                  className="btn-ghost px-3 py-1 text-[11px] border border-border/60 rounded hover:bg-bg-hover flex items-center gap-1.5"
                  onClick={() => refWavInputRef.current?.click()}
                  disabled={uploadingRef}
                >
                  🔄 Replace Audio
                </button>
                <button 
                  className="btn-ghost px-3 py-1 text-[11px] border border-danger/40 text-danger rounded hover:bg-danger/10 flex items-center gap-1.5"
                  onClick={deleteReferenceAudio}
                >
                  🗑️ Delete File
                </button>
              </div>
            </div>

            {/* Upload progress or drag & drop hint */}
            {uploadingRef && uploadProgress !== null ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] font-semibold text-accent mb-1">
                  <span>Uploading reference audio...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-border/40 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-accent h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-center text-[10px] text-txt-faint border border-dashed border-border/40 py-1 rounded">
                💡 Drag & Drop a .wav or .mp3 file here to upload / replace this reference audio.
              </div>
            )}
          </div>
        ) : (
          <div 
            className={`p-4 rounded-lg border border-dashed text-center transition-all ${
              isDragging 
                ? "border-accent bg-accent/10 scale-[1.01]" 
                : "border-border/60 bg-bg/5 hover:bg-bg/10"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => refWavInputRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center gap-1 cursor-pointer">
              <span className="text-xl">🎙️</span>
              <span className="text-[11px] font-semibold text-txt-muted">
                {uploadingRef ? "Uploading..." : "Click or Drag & Drop a .wav or .mp3 file here to upload reference voice"}
              </span>
              <span className="text-[10px] text-txt-faint">Maximum size 100 MB</span>
            </div>
            {uploadingRef && uploadProgress !== null && (
              <div className="mt-3 max-w-md mx-auto w-full">
                <div className="flex items-center justify-between text-[10px] font-semibold text-accent mb-1">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-border/40 h-1 rounded-full overflow-hidden">
                  <div className="bg-accent h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* profiles table list */}
      <div className="overflow-auto flex-1 min-h-0">
        {loading ? (
          <div className="px-4 py-12 text-center text-txt-faint text-xs font-medium">Loading character lists…</div>
        ) : filteredEntries.length === 0 ? (
          <div className="px-4 py-12 text-center text-txt-faint text-xs font-medium">
            {query ? "No matching profiles found." : "No characters profiles loaded yet. Add one above to apply speech voice cloning."}
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-bg-elevated/95 text-txt-muted border-b border-border z-10">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Avatar</th>
                <th className="px-4 py-2 text-left font-semibold">Name</th>
                <th className="px-4 py-2 text-left font-semibold w-20">Gender</th>
                <th className="px-4 py-2 text-left font-semibold">Voice profile</th>
                <th className="px-4 py-2 text-left font-semibold">Reference WAV</th>
                <th className="px-4 py-2 text-center font-semibold w-28">Usage Stats</th>
                <th className="px-4 py-2 text-center font-semibold w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filteredEntries.map(([key, p]) => {
                const charColor = p.color || "#8b5cf6";
                const cStats = stats.get(key) || { count: 0, duration: 0 };
                return (
                  <tr 
                    key={key} 
                    className={`hover:bg-bg-hover/20 transition-colors ${
                      selectedCharName === key ? "bg-accent/10 border-l-2 border-accent" : ""
                    }`}
                  >
                    {/* Character Avatar */}
                    <td className="px-4 py-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-md hover:scale-105 transition-transform"
                        style={{ backgroundColor: charColor }}
                        title="Character Avatar"
                      >
                        {p.emoji || initials(key)}
                      </div>
                    </td>
                    <td 
                      className="px-4 py-2 text-txt font-semibold text-xs cursor-pointer hover:text-accent hover:underline"
                      onClick={() => editCharacter(key, p)}
                      title="Click to edit character"
                    >
                      {key}
                    </td>
                    <td className="px-4 py-2 text-txt-muted capitalize text-[11px]">{p.gender}</td>
                    <td className="px-4 py-2 text-txt-muted">{p.voice ? voiceLabel(p.voice) : "—"}</td>
                    <td className="px-4 py-2 text-txt-muted font-mono truncate max-w-[200px]" title={p.ref_wav}>
                      {p.ref_wav || "—"}
                    </td>
                    {/* Speaking Statistics */}
                    <td className="px-4 py-2 text-center text-[10px] text-txt-faint font-semibold">
                      {cStats.count > 0 ? (
                        <span>
                          {cStats.count} lines ({cStats.duration.toFixed(1)}s)
                        </span>
                      ) : (
                        <span className="opacity-50">Not used</span>
                      )}
                    </td>
                    {/* Action buttons */}
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          className="btn-ghost px-2.5 py-0.5 text-[10px] border border-border/50 rounded hover:text-accent flex items-center gap-1"
                          onClick={() => playReferenceSample(p.ref_wav)}
                          disabled={!p.ref_wav || playingRef !== null}
                        >
                          {playingRef === p.ref_wav ? "⌛ Playing" : "🔊 Play Sample"}
                        </button>
                        <button
                          className="btn-ghost px-2.5 py-0.5 text-[10px] border border-border/50 rounded hover:text-accent flex items-center gap-1"
                          onClick={() => previewCharacter(key, p)}
                          disabled={previewing !== null}
                        >
                          {previewing === key ? "⌛ Playing" : "🔊 Preview"}
                        </button>
                        <button
                          className="btn-ghost px-2.5 py-0.5 text-[10px] border border-border/50 rounded hover:text-accent"
                          onClick={() => duplicateCharacter(key, p)}
                          title="Clone Profile"
                        >
                          👯 Clone
                        </button>
                        <button
                          className="text-danger hover:bg-danger/10 p-1 py-0.5 rounded transition-colors text-[10px] font-semibold border border-transparent hover:border-danger/25"
                          onClick={() => remove(key)}
                          title="Remove Profile"
                        >
                          ✕ Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
