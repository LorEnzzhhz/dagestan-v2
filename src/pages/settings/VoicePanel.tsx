import { useEffect, useState } from "react";
import { listAllVoices, type TtsVoice } from "@/lib/tts";
import { Volume2, Loader2, AlertTriangle, Check } from "lucide-react";

const STORAGE_KEY = "dagestan.tts.voice";

function loadSavedVoice(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
}
function saveVoice(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
}

export function VoicePanel() {
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(loadSavedVoice);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      setLoading(true);
      try {
        const all = await listAllVoices();
        if (!cancelled) setVoices(all);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void tick();
    // Re-probe periodically — browser voices load asynchronously after
    // the page is interactive.
    const id = window.setInterval(tick, 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const localVoices = voices.filter((v) => v.engine === "local");
  const browserVoices = voices.filter((v) => v.engine === "browser");

  function preview(v: TtsVoice) {
    const u = new SpeechSynthesisUtterance(
      "Hello from Dagestan. This is how I sound.",
    );
    u.rate = 1.0;
    if (v.engine === "browser" && typeof window !== "undefined") {
      const real = window.speechSynthesis.getVoices().find((bv) => bv.voiceURI === v.id);
      if (real) u.voice = real;
      window.speechSynthesis.speak(u);
    } else {
      // local engine preview would play through the cascade; for now
      // also use the browser fallback so the user hears something.
      window.speechSynthesis.speak(u);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-xs text-muted-foreground">
        Browser SpeechRecognition handles voice-to-text automatically. For
        text-to-speech, Dagestan tries a local Nemotron/Piper engine first
        and falls back to your browser's built-in voice.
      </p>

      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
        {localVoices.length > 0 ? (
          <>
            <Check className="size-4 text-emerald-500" />
            <span>
              <strong>Local TTS engine online</strong> — {localVoices.length}{" "}
              voice{localVoices.length === 1 ? "" : "s"} available
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="size-4 text-amber-500" />
            <span>
              No local TTS engine installed. Install Piper or another TTS
              binary under <code>scripts/local-models/engines/</code> to enable
              server-side speech. Browser voices below are used as fallback.
            </span>
          </>
        )}
      </div>

      {loading && voices.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Loading voices…
        </div>
      ) : (
        <>
          {localVoices.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Local engine
              </div>
              {localVoices.map((v) => (
                <VoiceRow key={v.id} v={v} selected={selected} onSelect={setSelected} onPreview={preview} />
              ))}
            </div>
          )}
          {browserVoices.length > 0 && (
            <div>
              <div className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Browser voices ({browserVoices.length})
              </div>
              {browserVoices.map((v) => (
                <VoiceRow key={v.id} v={v} selected={selected} onSelect={setSelected} onPreview={preview} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VoiceRow({
  v, selected, onSelect, onPreview,
}: { v: TtsVoice; selected: string; onSelect: (id: string) => void; onPreview: (v: TtsVoice) => void }) {
  const isSel = selected === v.id;
  return (
    <button
      type="button"
      onClick={() => { onSelect(v.id); saveVoice(v.id); }}
      className="group flex w-full items-center justify-between gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Volume2 className="size-3 shrink-0 text-primary" />
          <span className="truncate font-medium">{v.name}</span>
          {isSel && <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">SELECTED</span>}
        </div>
        {v.language && (
          <div className="ml-5 text-[10px] text-muted-foreground">{v.language}</div>
        )}
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onPreview(v); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPreview(v); } }}
        className="rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        Preview
      </span>
    </button>
  );
}
