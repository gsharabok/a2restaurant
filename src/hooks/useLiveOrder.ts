"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_PRICED, type Order, type PricedOrder } from "@/lib/order";
import type { Suggestion } from "@/lib/suggest";
import type { ReviewSheet } from "@/lib/reviews";
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
  ms: number;
};

/** Silence after which the words so far are treated as a finished turn. */
const TURN_GAP_MS = 1500;

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
  useEffect(() => {
    committed.current = onTurnCommitted;
    payAsked.current = onPayAsked;
  }, [onTurnCommitted, onPayAsked]);

  const commit = useCallback(() => {
    if (inFlight.current) {
      pendingCommit.current = true;
      return;
    }
    pendingCommit.current = false;
    const result = latest.current;
    if (!said.current) return;
    let turn: CommittedTurn | null = null;
    if (result) {
      const countBefore = basePriced.current.count;
      const acceptedName = result.accepted ? (shown.current?.items[result.accepted - 1]?.name ?? null) : null;
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
    }
    setTranscript({ settled: "", unsettled: "", previous: said.current });
    said.current = "";
    latest.current = null;
    committed.current?.(turn);
  }, []);

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
      if (options?.endOnSilence !== false) timer.current = setTimeout(commit, TURN_GAP_MS);
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
    [commit, restaurantId],
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
