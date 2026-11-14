"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_PRICED, type Order, type PricedOrder } from "@/lib/order";
import type { Suggestion } from "@/lib/suggest";
import type { ReviewSheet } from "@/lib/reviews";
import { acceptedNames } from "@/lib/curate";
import type { CommittedTurn } from "@/lib/waiterSay";

type InterpretResponse = {
  order: Order;
  priced: PricedOrder;
  suggestion: Suggestion | null;
  accepted: number | null;
  nutrition: boolean;
  done: boolean;
  pay: boolean;
  reviews: ReviewSheet | null;
  /** What to tell a guest who asked for reviews where none are saved. */
  reviewsMissing: string | null;
  /** Set while choosing a restaurant, once the guest has picked one. */
  go?: { restaurant: string; item?: string } | null;
  ms: number;
};

/** Silence after which the words so far are treated as a finished turn. */
const TURN_GAP_MS = 1500;
/** When the waiter has an answer ready, the turn ends this soon after the last new word. */
const REPLY_GAP_MS = 500;

export type Transcript = { settled: string; unsettled: string; previous: string };

/**
 * The fast lane. Every transcript change re-interprets the whole turn against the order as it
 * stood when the turn began, so revised words correct the screen instead of stacking up.
 * Only the newest answer is ever rendered.
 */
export function useLiveOrder(
  restaurantId: string,
  onTurnCommitted?: (turn: CommittedTurn | null) => void,
  onPayAsked?: () => void,
  /** Shown every interpretation as the turn it would make; returns true when the waiter will answer it. */
  onTurnPreview?: (turn: CommittedTurn) => boolean,
  onGo?: (go: { restaurant: string; item?: string }) => void,
) {
  const [priced, setPriced] = useState<PricedOrder>(EMPTY_PRICED);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [transcript, setTranscript] = useState<Transcript>({ settled: "", unsettled: "", previous: "" });
  const [done, setDone] = useState(false);
  /** True while the guest's latest words ask for the nutrition breakdown. */
  const [nutritionAsked, setNutritionAsked] = useState(false);
  /** The reviews the guest asked for, kept up until they close it or move on. */
  const [reviews, setReviews] = useState<ReviewSheet | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = useRef<Order>({ lines: [] });
  const basePriced = useRef<PricedOrder>(EMPTY_PRICED);
  const shownPriced = useRef<PricedOrder>(EMPTY_PRICED);
  const latest = useRef<InterpretResponse | null>(null);
  const shown = useRef<Suggestion | null>(null);
  const said = useRef("");
  const seq = useRef(0);
  const firstSeen = useRef<string[]>([]); // cards keep the place they first appeared in
  const inFlight = useRef<AbortController | null>(null);
  const pendingCommit = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(onTurnCommitted);
  const payAsked = useRef(onPayAsked);
  const goAsked = useRef(onGo);
  const preview = useRef(onTurnPreview);
  /** How the turn will end: on silence or not, whether an answer is waiting, and when words last arrived or changed. */
  const ending = useRef({ onSilence: true, answerReady: false, heardAt: 0, changedAt: 0 });
  useEffect(() => {
    committed.current = onTurnCommitted;
    payAsked.current = onPayAsked;
    goAsked.current = onGo;
    preview.current = onTurnPreview;
  }, [onTurnCommitted, onPayAsked, onTurnPreview, onGo]);

  const commit = useCallback(() => {
    if (inFlight.current) {
      pendingCommit.current = true;
      return;
    }
    pendingCommit.current = false;
    ending.current.answerReady = false;
    const result = latest.current;
    if (!said.current) return;
    let turn: CommittedTurn | null = null;
    if (result) {
      const countBefore = basePriced.current.count;
      const acceptedName = result.accepted ? acceptedNames(shown.current, result.accepted) : null;
      base.current = result.order;
      basePriced.current = shownPriced.current;
      // Suggestions stay up until a new question replaces them or one is accepted.
      const next = result.suggestion ?? (result.accepted ? null : shown.current);
      shown.current = next;
      setSuggestion(next);
      const done = result.done && result.order.lines.length > 0;
      if (done) setDone(true);
      turn = {
        order: result.order,
        priced: shownPriced.current,
        countBefore,
        suggestion: result.suggestion,
        acceptedName,
        suggestionsShown: Boolean(next?.items.length),
        nutrition: result.nutrition,
        done,
        pay: result.pay,
        reviewsSay: result.reviews?.say ?? result.reviewsMissing,
      };
      // Like paying, reviews open at the end of the sentence; the next turn that isn't about reviews closes them.
      setReviews(result.reviews);
      // Paying waits for the end of the sentence, so a half-heard phrase never opens the checkout.
      if (result.pay) payAsked.current?.();
      // Like paying, leaving for a restaurant waits for the end of the sentence.
      if (result.go) goAsked.current?.(result.go);
    }
    setTranscript({ settled: "", unsettled: "", previous: said.current });
    said.current = "";
    latest.current = null;
    committed.current?.(turn);
  }, []);

  /** A question should be answered promptly; an order waits longer, since the guest may be thinking of the next item. */
  const endOnSilence = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const { onSilence, answerReady, heardAt, changedAt } = ending.current;
    if (!onSilence) return;
    const due = answerReady ? changedAt + REPLY_GAP_MS : heardAt + TURN_GAP_MS;
    timer.current = setTimeout(commit, Math.max(0, due - performance.now()));
  }, [commit]);

  /** Lets the waiter get its answer ready while the guest is still talking. */
  const previewTurn = useCallback(
    (result: InterpretResponse) => {
      const next = result.suggestion ?? (result.accepted ? null : shown.current);
      ending.current.answerReady = Boolean(
        preview.current?.({
          ...result,
          priced: shownPriced.current,
          countBefore: basePriced.current.count,
          acceptedName: result.accepted ? acceptedNames(shown.current, result.accepted) : null,
          reviewsSay: result.reviews?.say ?? result.reviewsMissing,
          suggestionsShown: Boolean(next?.items.length),
          done: result.done && result.order.lines.length > 0,
        }),
      );
      endOnSilence();
    },
    [endOnSilence],
  );

  const hear = useCallback(
    (text: { settled: string; unsettled: string }, options?: { endOnSilence?: boolean }) => {
      const full = `${text.settled} ${text.unsettled}`.trim();
      setTranscript((current) => ({ ...text, previous: full ? "" : current.previous }));
      if (timer.current) clearTimeout(timer.current);
      if (!full) {
        // The words were taken back (typed text deleted): show the order from before the turn.
        if (!said.current) return;
        inFlight.current?.abort();
        inFlight.current = null;
        seq.current++;
        said.current = "";
        latest.current = null;
        pendingCommit.current = false;
        shownPriced.current = basePriced.current;
        setPriced(basePriced.current);
        setSuggestion(shown.current);
        setNutritionAsked(false);
        return;
      }
      ending.current.onSilence = options?.endOnSilence !== false;
      ending.current.heardAt = performance.now();
      if (full !== said.current) {
        ending.current.changedAt = ending.current.heardAt;
        ending.current.answerReady = false;
      }
      endOnSilence();
      if (full === said.current) return;
      said.current = full;

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const id = ++seq.current;
      const sent = performance.now();

      fetch("/api/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant: restaurantId,
          before: base.current,
          said: full,
          shownSuggestions: shown.current?.items.map((item) => item.id) ?? [],
          shownCombo: shown.current?.combo?.ask,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body?.error ?? "Interpreter error");
          return body as InterpretResponse;
        })
        .then((result) => {
          if (id !== seq.current) return;
          latest.current = result;
          for (const line of result.priced.lines) {
            if (!firstSeen.current.includes(line.itemId)) firstSeen.current.push(line.itemId);
          }
          const place = (id: string) => firstSeen.current.indexOf(id);
          const lines = [...result.priced.lines].sort((a, b) => place(a.itemId) - place(b.itemId));
          shownPriced.current = { ...result.priced, lines };
          setPriced(shownPriced.current);
          setSuggestion(result.suggestion ?? (result.accepted ? null : shown.current));
          setNutritionAsked(result.nutrition);
          setLatency(Math.round(performance.now() - sent));
          setError(null);
          previewTurn(result);
        })
        .catch((cause: Error) => {
          if (cause.name === "AbortError" || id !== seq.current) return;
          setError(cause.message);
        })
        .finally(() => {
          if (id !== seq.current) return;
          inFlight.current = null;
          if (pendingCommit.current) commit();
        });
    },
    [commit, endOnSilence, previewTurn, restaurantId],
  );

  /** Ends the turn now (Enter in typed mode) instead of waiting for silence. */
  const endTurn = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    commit();
  }, [commit]);

  /** Shows a suggestion the waiter came up with unasked; the guest can accept it like any other. */
  const offer = useCallback((offered: Suggestion) => {
    shown.current = offered;
    setSuggestion(offered);
  }, []);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    inFlight.current?.abort();
    inFlight.current = null;
    seq.current++;
    base.current = { lines: [] };
    basePriced.current = EMPTY_PRICED;
    shownPriced.current = EMPTY_PRICED;
    firstSeen.current = [];
    latest.current = null;
    shown.current = null;
    said.current = "";
    pendingCommit.current = false;
    setPriced(EMPTY_PRICED);
    setSuggestion(null);
    setTranscript({ settled: "", unsettled: "", previous: "" });
    setDone(false);
    setNutritionAsked(false);
    setReviews(null);
    setLatency(null);
    setError(null);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    inFlight.current?.abort();
  }, []);

  const closeReviews = useCallback(() => setReviews(null), []);

  return { priced, suggestion, nutritionAsked, reviews, closeReviews, transcript, done, latency, error, hear, endTurn, offer, reset };
}
