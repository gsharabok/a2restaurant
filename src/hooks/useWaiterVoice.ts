"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/suggest";
import { mayUpsell, upsellOffer, UPSELL_QUESTION, waiterLine, type CommittedTurn } from "@/lib/waiterSay";

/** After the waiter stops, the raw microphone stays ignored this long so the tail of its voice isn't heard as the guest. */
const ECHO_TAIL_MS = 600;
/** The recogniser can report the waiter's last words this long after they were said. */
const ECHO_WORDS_MS = 1500;
/** Quiet time after a plain order before the waiter offers something, so it never cuts in. */
const UPSELL_PAUSE_MS = 1400;
const FADE_MS = 150;
/** Spoken lines kept ready at once; older ones are dropped. */
const MAX_PREPARED = 6;

const lettersOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, "");

/**
 * True when everything heard is made of the waiter's own words. The recogniser may cut a word
 * short ("light") or run two together ("avosmash"), so each is looked for in the unspaced line.
 */
function isEcho(heard: string, line: string): boolean {
  const words = lettersOf(heard).split(" ").filter(Boolean);
  return words.length > 0 && words.every((word) => line.includes(word));
}

type Options = {
  /** Whose menu the offer is picked from. */
  restaurantId: string;
  /** Puts an offer on screen so the guest can accept it by voice. */
  offer: (suggestion: Suggestion) => void;
  /** Called when the microphone counts again after the waiter spoke. */
  onMicResume: () => void;
};

/**
 * The waiter's voice. It only speaks after a finished guest turn, stays quiet for plain orders,
 * and gives way as soon as the guest speaks or types.
 *
 * The waiter must not take its own voice for the guest. With an echo-cancelled microphone the
 * recogniser barely hears the waiter, and what little gets through is recognised as the waiter's
 * own line and dropped, so the guest can talk over it. Without one, the microphone is ignored
 * while the waiter talks, unless the guest wears headphones.
 */
export function useWaiterVoice({ restaurantId, offer, onMicResume }: Options) {
  const [enabled, setEnabledState] = useState(true);
  /** On headphones the microphone cannot hear the waiter, so the guest's voice may cut it off. */
  const [headphones, setHeadphonesState] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabledRef = useRef(true);
  const headphonesRef = useRef(false);
  const echoCancelledRef = useRef(false);
  /** The line the microphone may be picking up, how long that stays possible, and whether it did. */
  const echo = useRef({ line: "", until: 0, heard: false });
  const audio = useRef<HTMLAudioElement | null>(null);
  const utterance = useRef(0);
  const state = useRef<"idle" | "loading" | "playing">("idle");
  const micIgnoredUntil = useRef(0);
  const whenIdle = useRef<(() => void)[]>([]);
  const prepared = useRef(new Map<string, HTMLAudioElement>());
  const upsell = useRef<{ id: number; timer: ReturnType<typeof setTimeout> | null; used: boolean }>({ id: 0, timer: null, used: false });
  const callbacks = useRef({ offer, onMicResume });
  useEffect(() => {
    callbacks.current = { offer, onMicResume };
  }, [offer, onMicResume]);

  const settle = useCallback((heardByMic: boolean, byGuest = false) => {
    state.current = "idle";
    setSpeaking(false);
    setLine(null);
    echo.current.until = heardByMic ? performance.now() + ECHO_WORDS_MS : 0;
    if (heardByMic && !headphonesRef.current) {
      if (!echoCancelledRef.current) {
        micIgnoredUntil.current = performance.now() + ECHO_TAIL_MS;
        setTimeout(() => callbacks.current.onMicResume(), ECHO_TAIL_MS);
      } else if (!byGuest) {
        // Any of the waiter's words that got through are forgotten, unless the guest has spoken since.
        setTimeout(() => {
          if (echo.current.heard && state.current === "idle") callbacks.current.onMicResume();
          echo.current.heard = false;
        }, ECHO_WORDS_MS);
      }
    }
    for (const resolve of whenIdle.current.splice(0)) resolve();
  }, []);

  /** Stops the waiter mid-sentence with a short fade. */
  const stop = useCallback(() => {
    if (state.current === "idle") return;
    const wasPlaying = state.current === "playing";
    utterance.current++;
    const element = audio.current;
    audio.current = null;
    if (element) {
      const from = element.volume;
      const started = performance.now();
      const fade = () => {
        const left = 1 - (performance.now() - started) / FADE_MS;
        if (left <= 0 || element.paused) {
          element.pause();
          element.removeAttribute("src");
          return;
        }
        element.volume = from * left;
        setTimeout(fade, 20);
      };
      fade();
    }
    settle(wasPlaying, true);
  }, [settle]);

  const say = useCallback(
    (text: string) => {
      if (!enabledRef.current) return;
      stop();
      const id = ++utterance.current;
      state.current = "loading";
      setLine(text);
      echo.current = { line: lettersOf(text).replace(/ /g, ""), until: Infinity, heard: false };
      // The browser plays the stream as it downloads, so speech starts before the line is fully generated.
      // A line prepared during the guest's sentence is already downloading and starts at once.
      const ready = prepared.current.get(text);
      prepared.current.delete(text);
      const element = ready && !ready.error ? ready : new Audio(`/api/speak?text=${encodeURIComponent(text)}`);
      audio.current = element;
      const current = () => id === utterance.current;
      element.onplaying = () => {
        if (!current()) return;
        state.current = "playing";
        setSpeaking(true);
        setError(null);
      };
      element.onended = () => {
        if (!current()) return;
        audio.current = null;
        settle(true);
      };
      element.onerror = () => {
        if (!current()) return;
        audio.current = null;
        setError("The waiter's voice is unavailable. Check ELEVENLABS_API_KEY in .env.local; ordering still works.");
        settle(false);
      };
      element.play().catch((cause: Error) => {
        if (!current() || cause.name !== "NotAllowedError") return;
        audio.current = null;
        setError("Chrome blocked the sound. Click anywhere on the page once and the waiter can speak.");
        settle(false);
      });
    },
    [settle, stop],
  );

  /** Generates a line the waiter is likely to say next, so it starts without a wait when the turn ends. */
  const prepare = useCallback((text: string) => {
    if (!enabledRef.current || prepared.current.has(text)) return;
    const element = new Audio();
    element.preload = "auto";
    element.src = `/api/speak?text=${encodeURIComponent(text)}`;
    prepared.current.set(text, element);
    if (prepared.current.size > MAX_PREPARED) prepared.current.delete(prepared.current.keys().next().value!);
  }, []);

  /**
   * Call with the turn each interpretation would make, while the guest is still talking.
   * The answer is generated ahead; returns true when the turn should end early so it can be said.
   */
  const onPreview = useCallback(
    (turn: CommittedTurn): boolean => {
      if (!enabledRef.current) return false;
      const reply = waiterLine(turn);
      if (!reply) return false;
      prepare(reply);
      // Paying waits for the full pause, so a half-heard phrase never opens the checkout.
      return !turn.pay;
    },
    [prepare],
  );

  const cancelUpsell = useCallback(() => {
    upsell.current.id++;
    if (upsell.current.timer) clearTimeout(upsell.current.timer);
    upsell.current.timer = null;
  }, []);

  /** Call with every finished guest turn; the waiter decides whether to answer, offer something, or stay quiet. */
  const onTurn = useCallback(
    (turn: CommittedTurn | null) => {
      cancelUpsell();
      if (!turn || !enabledRef.current) return;
      const reply = waiterLine(turn);
      if (reply) {
        say(reply);
        return;
      }
      if (upsell.current.used || !mayUpsell(turn)) return;

      const id = upsell.current.id;
      // The pairing is fetched during the pause, so the offer is ready the moment the pause ends.
      const pairing = fetch("/api/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurant: restaurantId, before: turn.order, said: UPSELL_QUESTION, shownSuggestions: [] }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { suggestion: Suggestion | null } | null) => upsellOffer(body?.suggestion ?? null))
        .then((suggestion) => {
          if (suggestion && id === upsell.current.id) prepare(suggestion.caption);
          return suggestion;
        })
        .catch(() => null);
      upsell.current.timer = setTimeout(async () => {
        const suggestion = await pairing;
        if (id !== upsell.current.id || !suggestion || !enabledRef.current) return;
        upsell.current.used = true;
        callbacks.current.offer(suggestion);
        say(suggestion.caption);
      }, UPSELL_PAUSE_MS);
    },
    [cancelUpsell, say, prepare, restaurantId],
  );

  /**
   * Call with every microphone update: the words of the turn so far, and whether the microphone is
   * echo-cancelled. Returns true when the words must be dropped because they are the waiter's own
   * voice coming back through the speakers. Anything else the guest says stops the waiter.
   */
  const micHeard = useCallback(
    (heard: string, echoCancelled: boolean): boolean => {
      echoCancelledRef.current = echoCancelled;
      if (!headphonesRef.current) {
        const now = performance.now();
        if (!echoCancelled && (state.current === "playing" || now < micIgnoredUntil.current)) return true;
        if (now < echo.current.until && isEcho(heard, echo.current.line)) {
          echo.current.heard = true;
          return true;
        }
      }
      if (heard) {
        echo.current.heard = false;
        cancelUpsell();
        stop();
      }
      return false;
    },
    [cancelUpsell, stop],
  );

  /** Typing can't be an echo, so it always takes the floor. */
  const guestTyped = useCallback(() => {
    cancelUpsell();
    stop();
  }, [cancelUpsell, stop]);

  /** Resolves once the waiter has finished the current line. */
  const idle = useCallback(
    () => (state.current === "idle" ? Promise.resolve() : new Promise<void>((resolve) => whenIdle.current.push(resolve))),
    [],
  );

  const reset = useCallback(() => {
    cancelUpsell();
    upsell.current.used = false;
    stop();
    setError(null);
  }, [cancelUpsell, stop]);

  const setEnabled = useCallback(
    (value: boolean) => {
      enabledRef.current = value;
      setEnabledState(value);
      if (!value) {
        cancelUpsell();
        stop();
        setError(null);
      }
    },
    [cancelUpsell, stop],
  );

  const setHeadphones = useCallback((value: boolean) => {
    headphonesRef.current = value;
    setHeadphonesState(value);
  }, []);

  useEffect(
    () => () => {
      utterance.current++;
      audio.current?.pause();
      if (upsell.current.timer) clearTimeout(upsell.current.timer);
    },
    [],
  );

  return { enabled, setEnabled, headphones, setHeadphones, speaking, line, error, say, prepare, stop, onTurn, onPreview, micHeard, guestTyped, idle, reset };
}
