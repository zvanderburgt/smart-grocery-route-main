import { useState, useEffect, useRef, useCallback } from "react";

export interface VoiceInputOptions {
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  language?: string;
}

// Chrome finalizes a phrase on any brief pause ("frozen"), then re-finalizes it
// with the rest ("frozen corn"). Merge the revision instead of emitting both.
export function mergeFinalTranscripts(pending: string, next: string): string {
  const a = pending.trim();
  const b = next.trim();
  if (!a) return b;
  if (!b) return a;
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerB.startsWith(lowerA)) return b;
  if (lowerA.endsWith(lowerB)) return a;
  return `${a} ${b}`;
}

const FINAL_SETTLE_MS = 900;

export function useVoiceInput(options: VoiceInputOptions = {}) {
  const { onResult, onError, continuous = false, language = "en-US" } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const shouldKeepListeningRef = useRef(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFinalRef = useRef("");
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingFinal = useCallback(() => {
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
    const pending = pendingFinalRef.current.trim();
    pendingFinalRef.current = "";
    if (pending) {
      onResultRef.current?.(pending);
    }
  }, []);
  const flushPendingFinalRef = useRef(flushPendingFinal);
  flushPendingFinalRef.current = flushPendingFinal;

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = continuous;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language;

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          const merged = mergeFinalTranscripts(
            pendingFinalRef.current,
            finalTranscript,
          );
          pendingFinalRef.current = merged;
          setTranscript(merged);
          if (settleTimeoutRef.current) {
            clearTimeout(settleTimeoutRef.current);
          }
          settleTimeoutRef.current = setTimeout(() => {
            flushPendingFinalRef.current();
          }, FINAL_SETTLE_MS);
        } else if (interimTranscript) {
          setTranscript(interimTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);

        // Recover silently in continuous mode for transient/no-input cases.
        if (
          continuous &&
          shouldKeepListeningRef.current &&
          (event.error === "no-speech" || event.error === "aborted")
        ) {
          return;
        }

        shouldKeepListeningRef.current = false;
        setIsListening(false);

        let errorMessage = "Voice input error";
        switch (event.error) {
          case "no-speech":
            errorMessage = "No speech detected. Please try again.";
            break;
          case "audio-capture":
            errorMessage = "Microphone not available.";
            break;
          case "not-allowed":
            errorMessage = "Microphone access denied.";
            break;
          case "network":
            errorMessage = "Network error. Check your connection.";
            break;
          default:
            errorMessage = `Voice input error: ${event.error}`;
        }

        onErrorRef.current?.(errorMessage);
      };

      recognitionRef.current.onend = () => {
        // Some browsers stop quickly even in continuous mode. Restart unless user explicitly stopped.
        if (
          continuous &&
          shouldKeepListeningRef.current &&
          recognitionRef.current
        ) {
          restartTimeoutRef.current = setTimeout(() => {
            try {
              recognitionRef.current?.start();
              setIsListening(true);
            } catch {
              setIsListening(false);
            }
          }, 120);
          return;
        }

        setIsListening(false);
      };
    } else {
      setIsSupported(false);
    }

    return () => {
      shouldKeepListeningRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
      }
      pendingFinalRef.current = "";
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [continuous, language]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      shouldKeepListeningRef.current = true;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      setTranscript("");
      pendingFinalRef.current = "";
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        shouldKeepListeningRef.current = false;
        console.error("Error starting recognition:", error);
        onErrorRef.current?.("Failed to start voice input");
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    shouldKeepListeningRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
    flushPendingFinal();
    setIsListening(false);
  }, [isListening, flushPendingFinal]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isSupported,
    transcript,
    startListening,
    stopListening,
    toggleListening,
  };
}
