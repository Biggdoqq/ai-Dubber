import { useMemo, useState, useEffect } from "react";
import { api } from "../api/client";
import type { Voice } from "../api/types";

interface Props {
  voices: Voice[];
  current: string;
  previewText: string;
  onSelect: (voiceId: string) => void;
  onClose: () => void;
}

type Category = "all" | "favs" | "khmer" | "english" | "other";

export default function VoicePickerDialog({
  voices,
  current,
  previewText,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Load favorites from local storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("fav_voices");
      if (stored) {
        setFavorites(new Set(JSON.parse(stored)));
      }
    } catch {
      // ignore localstorage failures
    }
  }, []);

  // Save favorites helper
  const toggleFavorite = (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(voiceId) ? next.delete(voiceId) : next.add(voiceId);
      try {
        localStorage.setItem("fav_voices", JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    let items = voices;

    // Filter by Category
    if (activeCategory === "favs") {
      items = items.filter((v) => favorites.has(v.id));
    } else if (activeCategory === "khmer") {
      items = items.filter(
        (v) => v.id.startsWith("km-") || v.label.toLowerCase().includes("khmer")
      );
    } else if (activeCategory === "english") {
      items = items.filter((v) => v.id.startsWith("en-"));
    } else if (activeCategory === "other") {
      items = items.filter(
        (v) =>
          !v.id.startsWith("km-") &&
          !v.label.toLowerCase().includes("khmer") &&
          !v.id.startsWith("en-")
      );
    }

    // Filter by Search Query
    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (v) =>
          v.label.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q) ||
          v.engine.toLowerCase().includes(q)
      );
    }

    return items;
  }, [voices, query, activeCategory, favorites]);

  const preview = async (voice: Voice) => {
    setPreviewing(voice.id);
    try {
      const res = await fetch(api.ttsPreviewUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: previewText || "សួស្តីនេះគឺជាសំឡេងសាកល្បង។ This is a voice preview.",
          voice: voice.id,
          speed: 1.0,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      // preview failure is non-fatal
    } finally {
      setPreviewing(null);
    }
  };

  const categories: { key: Category; label: string }[] = [
    { key: "all", label: "🌐 All" },
    { key: "favs", label: "⭐ Favorites" },
    { key: "khmer", label: "🇰🇭 Khmer" },
    { key: "english", label: "🇺🇸 English" },
    { key: "other", label: "🌍 Other" },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] backdrop-blur-sm">
      <div className="panel w-[520px] max-h-[85vh] flex flex-col border border-border/80 bg-bg-panel/95 shadow-2xl rounded-xl">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-txt flex items-center gap-1.5">
            <span className="text-accent">🗣</span> Select AI Voice Profile
          </h2>
          <button className="text-txt-faint hover:text-txt transition-colors text-xs" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* category tabs */}
        <div className="flex border-b border-border bg-bg/25 text-xs">
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key)}
              className={`flex-1 py-2 text-center transition-colors font-medium border-b-2 ${
                activeCategory === c.key
                  ? "border-accent text-accent bg-accent/5 font-semibold"
                  : "border-transparent text-txt-muted hover:text-txt hover:bg-bg-hover/20"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* search input */}
        <div className="px-4 py-3 border-b border-border bg-bg/10">
          <input
            autoFocus
            className="input w-full py-1.5 px-3 text-xs rounded-md bg-bg-elevated/40 focus:bg-bg-elevated"
            placeholder="Search voice name, engine, or locale…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* voices list */}
        <div className="overflow-auto flex-1 min-h-0 divide-y divide-border-muted">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-txt-faint text-xs font-medium">
              No voices found matching "{query}" in this category.
            </div>
          ) : (
            filtered.map((v) => {
              const isFav = favorites.has(v.id);
              const isCurrent = v.id === current;
              return (
                <div
                  key={v.id}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-bg-hover/30 transition-colors ${
                    isCurrent ? "bg-accent/15" : ""
                  }`}
                  onClick={() => {
                    onSelect(v.id);
                    onClose();
                  }}
                >
                  {/* favorite star toggle */}
                  <button
                    className={`text-sm focus:outline-none transition-transform active:scale-125 ${
                      isFav ? "text-yellow-400 opacity-100" : "text-txt-faint hover:text-yellow-400 opacity-40 hover:opacity-100"
                    }`}
                    onClick={(e) => toggleFavorite(e, v.id)}
                    title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                  >
                    ⭐
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-txt truncate flex items-center gap-1.5">
                      {v.label}
                      {isCurrent && (
                        <span className="text-[8px] bg-accent/25 text-accent px-1.5 py-0.2 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-txt-faint truncate font-mono">
                      {v.engine} · {v.id}
                    </div>
                  </div>

                  <button
                    className="btn-ghost p-1.5 text-xs hover:bg-accent/10 rounded transition-colors text-accent shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      preview(v);
                    }}
                    disabled={previewing !== null}
                    title="Preview speech preview"
                  >
                    {previewing === v.id ? "…" : "▶"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-between items-center text-[10px] text-txt-faint font-semibold bg-bg/10">
          <span>{filtered.length} voice(s) found</span>
          <button className="btn-ghost px-3 py-1 rounded border border-border/50 text-txt hover:bg-bg-hover" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
