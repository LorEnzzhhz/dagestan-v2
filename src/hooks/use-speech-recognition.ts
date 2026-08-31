import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal shape of the browser SpeechRecognition API we use. */
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export function useSpeechRecognition(options?: {
  onResult?: (transcript: string) => void;
  continuous?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recogRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(Boolean(SR));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        recogRef.current?.stop();
      } catch {
        /* gone */
      }
    };
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    try {
      const r = new SR();
      r.lang = navigator.language || "en-US";
      r.interimResults = true;
      r.continuous = options?.continuous ?? false;

      r.onresult = (e) => {
        let t = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          t += e.results[i][0]?.transcript ?? "";
        }
        if (t) options?.onResult?.(t);
      };

      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);

      recogRef.current = r;
      setListening(true);
      r.start();
    } catch {
      setListening(false);
    }
  }, [options]);

  const stop = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {
      /* gone */
    }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  return {
    listening,
    isSupported,
    start,
    stop,
    toggle,
  };
}
