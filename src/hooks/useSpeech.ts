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
  start: (track?: MediaStreamTrack) => void;
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

const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/**
 * The microphone with the browser's echo cancellation on, which takes the waiter's voice out of
 * what the recogniser hears. Null where the recogniser cannot be given a track (Chrome before 139):
 * it then listens to the raw microphone and the waiter's voice has to be ignored another way.
 */
async function echoCancelledMic(Ctor: RecognitionCtor): Promise<MediaStreamTrack | null> {
  // `available` arrived after `start(track)`, so its presence means the track is honoured.
  if (!("available" in Ctor) || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return stream.getAudioTracks()[0] ?? null;
  } catch {
    return null;
  }
}

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
  /** True while the recogniser hears the echo-cancelled microphone, so the waiter may talk while it listens. */
  const [echoCancelled, setEchoCancelled] = useState(false);
  const mic = useRef<MediaStreamTrack | null>(null);

  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const carried = useRef(""); // settled text from earlier recognition sessions in this turn
  const offset = useRef(0); // results before this index belong to an earlier turn
  const lastResults = useRef<ArrayLike<RecognitionResult> | null>(null);
  // Unsettled words the previous turn already used, so they aren't heard twice once they settle.
  const used = useRef<{ index: number; text: string; count: number } | null>(null);
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
      // Chrome may still split or reword the previous turn's words; that many words are skipped either way.
      let skip = 0;
      if (used.current) {
        let since = "";
        for (let i = used.current.index; i < results.length; i++) since += ` ${results[i][0].transcript}`;
        const total = wordsOf(since).length;
        const same = wordsOf(since).join(" ").toLowerCase().startsWith(used.current.text);
        // Reworded into no more words than before: nothing new was said.
        skip = same || total > used.current.count ? used.current.count : total;
      }
      for (let i = offset.current; i < results.length; i++) {
        let text = results[i][0].transcript;
        if (skip > 0 && i >= used.current!.index) {
          const words = wordsOf(text);
          text = words.slice(skip).join(" ");
          skip -= Math.min(skip, words.length);
        }
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
      used.current = null;
      if (wanted.current) {
        try {
          beginRef.current();
        } catch {
          wanted.current = false;
          setListening(false);
        }
      } else {
        mic.current?.stop();
        mic.current = null;
        setEchoCancelled(false);
        setListening(false);
      }
    };
    recognition.current = instance;
    const track = mic.current?.readyState === "live" ? mic.current : null;
    if (track) instance.start(track);
    else instance.start();
    setEchoCancelled(Boolean(track));
    setListening(true);
  }, [read]);
  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  const start = useCallback(async () => {
    const Ctor = getCtor();
    if (wanted.current || !Ctor) return;
    setError(null);
    wanted.current = true;
    mic.current = await echoCancelledMic(Ctor);
    if (!wanted.current) {
      mic.current?.stop();
      return;
    }
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
    mic.current?.stop();
    mic.current = null;
  }, []);

  /** Starts a new turn: words heard so far no longer count. */
  const resetTurn = useCallback(() => {
    carried.current = "";
    const results = lastResults.current;
    if (results) {
      let next = results.length;
      while (next > 0 && !results[next - 1].isFinal) next--;
      offset.current = next;
      let pending = "";
      for (let i = next; i < results.length; i++) pending += ` ${results[i][0].transcript}`;
      const words = wordsOf(pending);
      used.current = words.length ? { index: next, text: words.join(" ").toLowerCase(), count: words.length } : null;
    }
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      recognition.current?.abort();
      mic.current?.stop();
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { listening, supported, echoCancelled, error, start, stop, resetTurn, clearError };
}
