/**
 * Voice Agent — Always-on voice assistant.
 *
 * - "Hey Dagestan" wake word detection (browser SpeechRecognition)
 * - Voice → text → AI → text → speech (Web Speech API)
 * - Continuous listening mode with visual feedback
 * - Works on-device via the proot container for offline mode
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeX, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { streamChat, type ApiMessage } from "@/lib/ai-client";
import { speak as ttsSpeak } from "@/lib/tts";

interface VoiceAgentProps {
  provider: string;
  model: string;
  onTranscript?: (text: string) => void;
}

type AgentState = "idle" | "listening" | "thinking" | "speaking";

/** Minimal SpeechRecognition type. */
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

const WAKE_WORD = "hey dagestan";
const SYSTEM_PROMPT = `You are Dagestan AI, a helpful voice assistant. 
Keep responses short and conversational (1-3 sentences max).
Don't use markdown or code blocks — speak naturally.
Be concise but helpful. If asked to do something complex, suggest using the chat instead.`;

export function VoiceAgent({ provider, model, onTranscript }: VoiceAgentProps) {
  const [state, setState] = useState<AgentState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);

  const recogRef = useRef<SpeechRec | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Speak text aloud via the cascade in src/lib/tts.ts.
  // Tries local Nemotron/Piper TTS first, falls back to Web Speech API.
  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled) return;
    setState("speaking");
    const result = await ttsSpeak(text);
    if (!result) { setState("idle"); return; }
    if (result.engine === "local" && result.audio) {
      result.audio.onended = () => setState("idle");
      result.audio.onerror = () => setState("idle");
      try { await result.audio.play(); } catch { setState("idle"); }
    } else {
      // Browser TTS — setState("idle") is wired via the SpeechSynthesisUtterance
      // onend inside tryBrowserTts. Use a fallback timer just in case.
      const t = setTimeout(() => setState("idle"), 30_000);
      const orig = result.cleanup;
      result.cleanup = () => { clearTimeout(t); orig?.(); };
    }
  }, [voiceEnabled]);

  // Send voice input to AI
  const processVoice = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setState("thinking");
    setTranscript(text);
    onTranscript?.(text);

    const messages: ApiMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.text })),
      { role: "user", content: text },
    ];

    let result = "";
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const delta of streamChat({ provider, model, messages, signal: controller.signal })) {
        result += delta;
        setResponse(result);
      }
      setHistory((prev) => [
        ...prev.slice(-10),
        { role: "user", text },
        { role: "assistant", text: result },
      ]);
      void speak(result);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const errMsg = "Sorry, I couldn't process that. Try again.";
        setResponse(errMsg);
        void speak(errMsg);
      }
    } finally {
      abortRef.current = null;
    }
  }, [provider, model, history, speak, onTranscript]);

  // Start/stop listening
  const toggleListening = useCallback(() => {
    if ((state as AgentState) === "listening") {
      recogRef.current?.stop();
      setState("idle");
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;

    r.onresult = (e) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        t += e.results[i][0]?.transcript ?? "";
      }
      setTranscript(t);

      // Check for wake word
      if (wakeEnabled && t.toLowerCase().includes(WAKE_WORD)) {
        const cmd = t.toLowerCase().replace(WAKE_WORD, "").trim();
        if (cmd) processVoice(cmd);
        return;
      }

      // If not using wake word, process on final result
      if (!wakeEnabled && e.results[e.resultIndex]?.[0]?.confidence > 0.8) {
        processVoice(t);
      }
    };

    r.onend = () => {
      // Restart if still in listening mode
      if ((state as AgentState) === "listening" || wakeEnabled) {
        try { r.start(); } catch { /* already started */ }
      }
    };

    r.onerror = () => {
      if ((state as AgentState) === "listening") {
        try { r.start(); } catch { /* ignore */ }
      }
    };

    recogRef.current = r;
    setState("listening");
    try { r.start(); } catch { /* ignore */ }
  }, [state, wakeEnabled, processVoice]);

  // Stop everything on unmount
  useEffect(() => {
    return () => {
      recogRef.current?.stop();
      synthRef.current?.cancel();
      abortRef.current?.abort();
    };
  }, []);

  const hasSR = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Mic className="size-4 text-primary" />
            Voice Agent
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              title={voiceEnabled ? "Mute responses" : "Enable voice responses"}
            >
              {voiceEnabled ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setWakeEnabled(!wakeEnabled)}
              title={wakeEnabled ? "Disable wake word" : "Enable wake word"}
            >
              <Settings className="size-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Main mic button */}
        <div className="flex flex-col items-center gap-3">
          <motion.button
            type="button"
            onClick={toggleListening}
            disabled={!hasSR}
            className={`relative flex size-16 items-center justify-center rounded-full border-2 transition-all ${
              state === "listening"
                ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20"
                : state === "thinking"
                  ? "border-amber-500 bg-amber-500/10"
                  : state === "speaking"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-border hover:border-primary/50"
            }`}
            whileTap={{ scale: 0.95 }}
          >
            {state === "thinking" ? (
              <Loader2 className="size-6 animate-spin text-amber-500" />
            ) : state === "listening" ? (
              <MicOff className="size-6 text-red-500" />
            ) : (
              <Mic className="size-6" />
            )}

            {/* Pulse rings when listening */}
            {state === "listening" && (
              <>
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-red-500/30"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-red-500/20"
                  animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                />
              </>
            )}
          </motion.button>

          {/* Status badge */}
          <Badge
            variant="outline"
            className={`text-[10px] ${
              state === "listening"
                ? "border-red-400/30 text-red-500"
                : state === "thinking"
                  ? "border-amber-400/30 text-amber-500"
                  : state === "speaking"
                    ? "border-emerald-400/30 text-emerald-500"
                    : "text-muted-foreground"
            }`}
          >
            {state === "idle" && "Tap to speak"}
            {state === "listening" && "Listening..."}
            {state === "thinking" && "Thinking..."}
            {state === "speaking" && "Speaking..."}
          </Badge>

          {wakeEnabled && (
            <p className="text-[10px] text-muted-foreground">
              Say "{WAKE_WORD}" to activate
            </p>
          )}
        </div>

        {/* Transcript & response */}
        <AnimatePresence>
          {transcript && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-border/60 p-2"
            >
              <p className="text-[10px] font-medium text-muted-foreground mb-1">You said:</p>
              <p className="text-xs">{transcript}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {response && state !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-primary/30 bg-primary/5 p-2"
          >
            <p className="text-[10px] font-medium text-primary mb-1">Dagestan:</p>
            <p className="text-xs">{response}</p>
          </motion.div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {history.slice(-6).map((h, i) => (
              <div
                key={i}
                className={`rounded p-1.5 text-[10px] ${
                  h.role === "user" ? "bg-secondary/50" : "bg-primary/5"
                }`}
              >
                <span className="font-medium">{h.role === "user" ? "You" : "AI"}:</span>{" "}
                {h.text.slice(0, 100)}{h.text.length > 100 ? "..." : ""}
              </div>
            ))}
          </div>
        )}

        {!hasSR && (
          <p className="text-center text-[10px] text-muted-foreground">
            Voice not supported in this browser
          </p>
        )}
      </CardContent>
    </Card>
  );
}
