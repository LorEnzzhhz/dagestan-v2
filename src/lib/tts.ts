/**
 * tts.ts — Pluggable text-to-speech pipeline.
 *
 * Cascade order:
 *  1. Local TTS engine on the local-models server (POST /v1/tts).
 *     When the server has a TTS engine installed (e.g. piper-cpp or a
 *     Nemotron audio model) it returns audio/mpeg bytes.
 *  2. Browser speechSynthesis — always available, used as fallback.
 *
 * This module never throws — every method returns null on failure so the
 * caller can fall through to the next engine.
 */

export interface TtsVoice {
  id: string;
  name: string;
  engine: "local" | "browser";
  language?: string;
  gender?: "male" | "female" | "neutral";
}

export interface TtsResult {
  engine: "local" | "browser";
  audio?: HTMLAudioElement;
  cleanup?: () => void;
}

// ── Port discovery (mirrors use-local-models.ts) ──────────────────
const PREFERRED_PORT = 18927;
const PROBE_RANGE = 5;
let cachedPort: number | null = null;
let probePromise: Promise<number> | null = null;

async function discoverPort(): Promise<number> {
  for (let i = 0; i < PROBE_RANGE; i++) {
    const port = PREFERRED_PORT + i;
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 500);
      const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: c.signal });
      clearTimeout(t);
      if (r.ok) return port;
    } catch {
      /* keep probing */
    }
  }
  return PREFERRED_PORT;
}

async function baseUrl(): Promise<string> {
  if (cachedPort === null) {
    probePromise ??= discoverPort().then((p) => { cachedPort = p; return p; });
    cachedPort = await probePromise;
  }
  return `http://127.0.0.1:${cachedPort}`;
}

// ── Public API ────────────────────────────────────────────────────

/** Detect whether the local TTS server has any engine installed. */
export async function localTtsAvailable(): Promise<boolean> {
  try {
    const base = await baseUrl();
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1000);
    const r = await fetch(`${base}/v1/tts/voices`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/** List voices offered by the local TTS engine. Empty if offline. */
export async function listLocalVoices(): Promise<TtsVoice[]> {
  try {
    const base = await baseUrl();
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2000);
    const r = await fetch(`${base}/v1/tts/voices`, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return [];
    const j = await r.json();
    const list: Array<{ id: string; name: string; language?: string; gender?: TtsVoice["gender"] }> =
      j.voices ?? [];
    return list.map((v) => ({ ...v, engine: "local" as const }));
  } catch {
    return [];
  }
}

/** List voices the browser exposes. */
export function listBrowserVoices(): TtsVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices.map((v) => ({
    id: v.voiceURI,
    name: v.name,
    language: v.lang,
    gender: undefined,
    engine: "browser",
  }));
}

/** Try the local TTS engine. Returns null on any failure. */
export async function tryLocalTts(text: string, voice?: string): Promise<TtsResult | null> {
  try {
    const base = await baseUrl();
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 30_000);
    const r = await fetch(`${base}/v1/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
      signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return {
      engine: "local",
      audio,
      cleanup: () => {
        URL.revokeObjectURL(url);
        audio.pause();
      },
    };
  } catch {
    return null;
  }
}

/** Try the browser's Web Speech API. */
export function tryBrowserTts(
  text: string,
  opts?: { voiceURI?: string; rate?: number; pitch?: number },
): TtsResult | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts?.rate ?? 1.0;
  u.pitch = opts?.pitch ?? 1.0;
  if (opts?.voiceURI) {
    const v = synth.getVoices().find((v) => v.voiceURI === opts.voiceURI);
    if (v) u.voice = v;
  }
  let ended = false;
  const onEnd = () => { ended = true; };
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
  return {
    engine: "browser",
    cleanup: () => {
      if (!ended) synth.cancel();
    },
  };
}

/** Cascade: try local first, fall back to browser. */
export async function speak(text: string, opts?: { voice?: string }): Promise<TtsResult | null> {
  const local = await tryLocalTts(text, opts?.voice);
  if (local) return local;
  return tryBrowserTts(text, { voiceURI: opts?.voice });
}

/** Combined voice catalog (local + browser) for the settings UI. */
export async function listAllVoices(): Promise<TtsVoice[]> {
  const [local, browser] = await Promise.all([
    listLocalVoices(),
    Promise.resolve(listBrowserVoices()),
  ]);
  return [...local, ...browser];
}

/** Test hook: clear the cached port so the next call re-probes. */
export function __resetPortCache(): void {
  cachedPort = null;
  probePromise = null;
}
