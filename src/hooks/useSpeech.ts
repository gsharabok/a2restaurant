"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

const getCtor = (): RecognitionCtor | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export type SpeechText = { settled: string; unsettled: string };

/**
 * Live transcript from the browser's speech recognition. `settled` words are final,
 * `unsettled` ones may still be revised. `onText` fires on every change.
 */
export function useSpeech(onText: (text: SpeechText) => void) {
  const [listening, setListening] = useState(false);
  const supported = useSyncExternalStore(
    () => () => {},
    () => Boolean(getCtor()),
    () => true,
  );
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const carried = useRef(""); // settled text from earlier recognition sessions in this turn
  const offset = useRef(0); // results before this index belong to an earlier turn
  const lastResults = useRef<ArrayLike<RecognitionResult> | null>(null);
  const onTextRef = useRef(onText);
  const beginRef = useRef<() => void>(() => {});
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const read = useCallback((): SpeechText => {
    let settled = carried.current;
    let unsettled = "";
    const results = lastResults.current;
    if (results) {
      for (let i = offset.current; i < results.length; i++) {
        const text = results[i][0].transcript;
        if (results[i].isFinal) settled += ` ${text}`;
        else unsettled += ` ${text}`;
      }
    }
    return { settled: settled.replace(/\s+/g, " ").trim(), unsettled: unsettled.replace(/\s+/g, " ").trim() };
  }, []);

  const begin = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const instance = new Ctor();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-GB";
    instance.onresult = (event) => {
      lastResults.current = event.results;
      onTextRef.current(read());
    };
    instance.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      wanted.current = false;
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in the address bar, or type your order."
          : event.error === "network"
            ? "Speech recognition needs an internet connection. You can type your order instead."
            : `Speech recognition stopped (${event.error}).`,
      );
    };
    instance.onend = () => {
      // Chrome ends a session after a pause; carry the settled words over and keep listening.
      carried.current = read().settled;
      lastResults.current = null;
      offset.current = 0;
      if (wanted.current) {
        try {
          beginRef.current();
        } catch {
          wanted.current = false;
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };
    recognition.current = instance;
    instance.start();
    setListening(true);
  }, [read]);
  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  const start = useCallback(() => {
    if (wanted.current) return;
    setError(null);
    wanted.current = true;
    try {
      begin();
    } catch {
      wanted.current = false;
      setError("Could not start the microphone.");
    }
  }, [begin]);

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
  }, []);

  /** Starts a new turn: words heard so far no longer count. */
  const resetTurn = useCallback(() => {
    carried.current = "";
    const results = lastResults.current;
    if (results) {
      let next = results.length;
      while (next > 0 && !results[next - 1].isFinal) next--;
      offset.current = next;
    }
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      recognition.current?.abort();
    },
    [],
  );

  return { listening, supported, error, start, stop, resetTurn };
}
