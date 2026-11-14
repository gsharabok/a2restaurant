"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChevronDown, Headphones, Keyboard, Mic, MicOff, Play, RotateCcw, Square, Volume2, VolumeX } from "lucide-react";
import { CuratedSet } from "./CuratedSet";
import { ItemImage } from "./ItemImage";
import { OrderCard } from "./OrderCard";
import { PayButton, type PayHandle } from "./PayButton";
import { useLiveOrder } from "@/hooks/useLiveOrder";
import { useSpeech, type SpeechText } from "@/hooks/useSpeech";
import { useWaiterVoice } from "@/hooks/useWaiterVoice";
import { formatPrice } from "@/lib/format";
import type { Suggestion } from "@/lib/suggest";
import { saySuggestion, type CommittedTurn } from "@/lib/waiterSay";

type Props = {
  restaurant: { id: string; name: string; tagline: string; nutritionNote: string; hints: string[]; demoTurns: string[] };
  restaurants: { id: string; name: string }[];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function Waiter({ restaurant, restaurants }: Props) {
  const [choosing, setChoosing] = useState(false);
  const resetSpeechTurn = useRef<() => void>(() => {});
  const payButton = useRef<PayHandle>(null);
  const [payAsks, setPayAsks] = useState(0);
  const offerRef = useRef<(suggestion: Suggestion) => void>(() => {});
  const voice = useWaiterVoice({
    restaurantId: restaurant.id,
    offer: useCallback((suggestion: Suggestion) => offerRef.current(suggestion), []),
    onMicResume: useCallback(() => resetSpeechTurn.current(), []),
  });
  const { onTurn, micHeard, guestTyped } = voice;
  const order = useLiveOrder(
    restaurant.id,
    useCallback(
      (turn: CommittedTurn | null) => {
        resetSpeechTurn.current();
        onTurn(turn);
      },
      [onTurn],
    ),
    useCallback(() => setPayAsks((asks) => asks + 1), []),
  );
  // Opened after the screen has drawn the turn, so the checkout charges the order that turn left.
  useEffect(() => {
    if (payAsks > 0) payButton.current?.pay();
  }, [payAsks]);
  const orderHear = order.hear;
  // While the waiter is talking through the speakers, the microphone hears the waiter, not the guest.
  const hearMic = useCallback(
    (text: SpeechText) => {
      if (!micHeard(Boolean(text.settled || text.unsettled))) orderHear(text);
    },
    [micHeard, orderHear],
  );
  const speech = useSpeech(hearMic);
  useEffect(() => {
    resetSpeechTurn.current = speech.resetTurn;
    offerRef.current = order.offer;
  }, [speech.resetTurn, order.offer]);

  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [playing, setPlaying] = useState(false);
  const playToken = useRef(0);
  const { hear, endTurn, reset } = order;

  const stopDemo = useCallback(() => {
    playToken.current++;
    setPlaying(false);
  }, []);

  const playDemo = useCallback(async () => {
    const token = ++playToken.current;
    speech.stop();
    setTyping(false);
    setTyped("");
    reset();
    voice.reset();
    setPlaying(true);
    await wait(500);
    for (const turn of restaurant.demoTurns) {
      const words = turn.split(" ");
      for (let i = 1; i <= words.length; i++) {
        if (token !== playToken.current) return;
        voice.guestTyped();
        hear({ settled: "", unsettled: words.slice(0, i).join(" ") });
        await wait(230);
      }
      if (token !== playToken.current) return;
      hear({ settled: turn, unsettled: "" });
      await wait(900);
      if (token !== playToken.current) return;
      endTurn();
      await wait(900);
      await voice.idle(); // let the waiter finish before the next line is typed
    }
    if (token === playToken.current) setPlaying(false);
  }, [endTurn, hear, reset, speech, voice, restaurant.demoTurns]);

  const startOver = () => {
    stopDemo();
    speech.stop();
    speech.clearError();
    reset();
    voice.reset();
    setTyped("");
  };

  const toggleMic = () => {
    stopDemo();
    if (speech.listening) speech.stop();
    else {
      setTyping(false);
      speech.start();
    }
  };

  const { priced, suggestion, nutritionAsked, transcript, done } = order;
  // An answer that shows up mid-sentence is voiced ahead of time, during the guest's closing pause.
  const answering = Boolean(transcript.settled || transcript.unsettled) && suggestion;
  const { prepare } = voice;
  useEffect(() => {
    if (answering) prepare(saySuggestion(answering));
  }, [answering, prepare]);
  const empty = priced.lines.length === 0;
  // On a phone the order is a scrolling list, so a new item is brought into view rather than left below the fold.
  const cards = useRef<HTMLElement>(null);
  const lineCount = priced.lines.length;
  useEffect(() => {
    const list = cards.current;
    if (list && window.matchMedia("(max-width: 639px)").matches) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [lineCount]);

  const words = `${transcript.settled} ${transcript.unsettled}`.trim();
  const problem = order.error ?? speech.error ?? voice.error;
  const showNutrition = nutritionAsked && !empty && !done;
  const showSuggestions = Boolean(suggestion && (suggestion.items.length > 0 || suggestion.combo) && !done && !showNutrition);
  // Cards shrink when they would not fit: past four the order wraps to a second row, and a panel below takes their height.
  const cardSize = priced.lines.length > 4 ? "compact" : showNutrition || showSuggestions ? "snug" : "full";
  const macros = [
    { label: "Calories", value: priced.nutrition.kcal.toLocaleString("en-GB"), unit: "kcal" },
    { label: "Protein", value: priced.nutrition.protein, unit: "g" },
    { label: "Carbs", value: priced.nutrition.carbs, unit: "g" },
    { label: "Fat", value: priced.nutrition.fat, unit: "g" },
  ];

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-[#0b0a09] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_50%_-10%,rgba(251,191,36,0.10),transparent_60%)]" />

      <header className="relative z-20 flex items-start justify-between gap-3 px-10 pt-8 max-sm:px-5 max-sm:pt-5">
        <div className="relative">
          <button
            onClick={() => setChoosing((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={choosing}
            className="-ml-3 flex items-center gap-2 rounded-xl px-3 py-1 text-left text-2xl font-semibold tracking-tight transition max-sm:text-xl hover:bg-white/[0.06]"
            data-testid="restaurant-picker"
          >
            {restaurant.name}
            <ChevronDown className={`h-5 w-5 text-white/40 transition-transform ${choosing ? "rotate-180" : ""}`} />
          </button>
          <p className="text-sm text-white/40 max-sm:text-xs">{restaurant.tagline}</p>
          <AnimatePresence>
            {choosing && (
              <motion.ul
                role="listbox"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute -left-3 top-11 z-30 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#171512] p-1.5 shadow-2xl"
              >
                {restaurants.map((option) => (
                  <li key={option.id} role="option" aria-selected={option.id === restaurant.id}>
                    <Link
                      href={`/${option.id}`}
                      onClick={() => {
                        setChoosing(false);
                        // The screen being left stays mounted in the background, so stop its mic and clear its order.
                        if (option.id !== restaurant.id) startOver();
                      }}
                      className={`block rounded-xl px-3 py-2 text-base transition hover:bg-white/10 ${
                        option.id === restaurant.id ? "font-semibold text-amber-200" : "text-white/75"
                      }`}
                    >
                      {option.name}
                    </Link>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-white/35">
            {priced.count > 0 ? `${priced.count} item${priced.count === 1 ? "" : "s"}` : "Your order"}
          </p>
          <motion.p
            key={priced.total}
            initial={{ opacity: 0.4, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-semibold tabular-nums tracking-tight max-sm:text-3xl"
            data-testid="total"
          >
            {formatPrice(priced.total)}
          </motion.p>
          <p className="mt-1 h-4 text-xs tabular-nums text-white/40" data-testid="total-nutrition">
            {!empty && `${priced.nutrition.kcal.toLocaleString("en-GB")} kcal · ${priced.nutrition.protein}g protein`}
          </p>
          {!empty && <PayButton ref={payButton} restaurant={restaurant} priced={priced} className="mt-2" />}
        </div>
      </header>

      <section ref={cards} className="relative z-10 flex min-h-0 flex-1 overflow-y-auto px-10 py-6 max-sm:px-4 max-sm:py-3 [@media(max-height:780px)]:py-2 [scrollbar-width:none]">
        <AnimatePresence mode="wait" initial={false}>
          {empty ? (
            <motion.div
              key="greeting"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="m-auto text-center"
            >
              <h1 className="text-5xl font-semibold tracking-tight max-sm:text-3xl">What can I get you?</h1>
              <p className="mt-4 text-lg text-white/45 max-sm:mt-2 max-sm:text-base">
                {speech.listening ? "I'm listening. Just say your order." : "Tap the microphone and say your order."}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2 max-sm:mt-5">
                {restaurant.hints.map((hint) => (
                  <span key={hint} className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-white/50">
                    {hint}
                  </span>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="order" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="m-auto w-full">
              <LayoutGroup>
                <motion.div layout className="mx-auto flex max-w-[86rem] flex-wrap items-stretch justify-center gap-4 max-sm:gap-2.5">
                  <AnimatePresence mode="popLayout">
                    {priced.lines.map((line) => (
                      <OrderCard key={line.itemId} line={line} size={cardSize} detailed={showNutrition} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </LayoutGroup>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {showNutrition && (
          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="relative z-10 mx-auto mb-4 w-full max-w-3xl px-6 max-sm:mb-2 max-sm:px-4"
            data-testid="nutrition"
          >
            <div className="flex items-center gap-6 rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-4 backdrop-blur max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5 max-sm:px-4 max-sm:py-3">
              <div className="flex gap-6 max-sm:justify-between max-sm:gap-3">
                {macros.map((macro) => (
                  <div key={macro.label}>
                    <p className="text-[10px] uppercase tracking-wider text-white/40">{macro.label}</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {macro.value}
                      <span className="ml-0.5 text-xs font-normal text-white/45">{macro.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
              {priced.nutrition.richIn.length > 0 && (
              <div className="min-w-0 flex-1 border-l border-white/10 pl-6 max-sm:border-l-0 max-sm:border-t max-sm:pl-0 max-sm:pt-2.5">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Good source of</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {priced.nutrition.richIn.length > 0 ? (
                    priced.nutrition.richIn.map((name) => (
                      <span key={name} className="rounded-full bg-amber-200/10 px-2.5 py-0.5 text-xs text-amber-200/90">
                        {name}
                      </span>
                    ))
                  ) : null}
                </div>
              </div>
              )}
            </div>
            <p className="mt-1.5 text-center text-[11px] text-white/30">For your whole order. {restaurant.nutritionNote}</p>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {suggestion && showSuggestions && (
          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="relative z-10 mx-auto mb-4 w-full max-w-5xl px-6 max-sm:mb-2 max-sm:px-4"
            data-testid="suggestions"
          >
            {/* The caption stops the waiter: on a phone the spoken-line bubble is hidden while suggestions show. */}
            <p
              className={`mb-2 text-center text-sm text-amber-200/90 ${voice.line ? "cursor-pointer" : ""}`}
              title={voice.line ? "Click to stop the waiter" : undefined}
              onClick={voice.line ? voice.stop : undefined}
            >
              {suggestion.caption}
            </p>
            {suggestion.combo && (
              <CuratedSet
                suggestion={suggestion}
                note={restaurant.nutritionNote}
                onAccept={() => {
                  guestTyped();
                  hear({ settled: "Yes, add them", unsettled: "" }, { endOnSilence: false });
                  endTurn();
                  setTyped("");
                }}
              />
            )}
            <div className={`flex justify-center gap-3 max-sm:flex-col max-sm:gap-1.5 ${suggestion.combo ? "hidden" : ""}`}>
              {suggestion.items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-amber-200/25 bg-amber-200/[0.06] px-4 py-3 max-sm:flex-none max-sm:px-3 max-sm:py-1.5"
                >
                  <ItemImage src={item.image} size={48} className="h-12 w-12 shrink-0 max-sm:h-10 max-sm:w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="text-[11px] text-white/45 tabular-nums max-sm:hidden">{item.kcal} kcal · {item.protein}g protein</p>
                    <p className="text-[11px] text-amber-200/70">say “{suggestion.items.length === 1 ? "yes please" : `add the ${["first", "second", "third"][index]} one`}”</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPrice(item.price)}</p>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <footer className="relative z-10 px-6 pb-6 max-sm:px-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {voice.line && voice.line !== suggestion?.caption && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={voice.stop}
              title="Click to stop the waiter"
              className={`${showSuggestions ? "max-sm:hidden" : ""} mx-auto mb-3 flex max-w-3xl items-center gap-3 rounded-2xl max-sm:mb-2 border border-amber-200/20 bg-amber-200/[0.07] px-4 py-2 text-left text-sm text-amber-100/90 backdrop-blur`}
              data-testid="waiter-line"
              data-speaking={voice.speaking}
            >
              <span className="flex h-4 shrink-0 items-end gap-0.5" aria-hidden>
                {[0, 1, 2, 3].map((bar) => (
                  <motion.span
                    key={bar}
                    className="w-0.5 rounded-full bg-amber-200"
                    animate={{ height: voice.speaking ? ["30%", "100%", "45%", "80%", "30%"] : "30%" }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: bar * 0.12 }}
                  />
                ))}
              </span>
              <span>{voice.line}</span>
            </motion.button>
          )}
        </AnimatePresence>
        <div className="mx-auto flex max-w-4xl items-center gap-4 rounded-full border border-white/10 bg-white/[0.06] py-2.5 pl-2.5 pr-5 backdrop-blur max-sm:flex-wrap max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:rounded-3xl max-sm:px-2.5">
          <button
            onClick={toggleMic}
            disabled={!speech.supported}
            aria-label={speech.listening ? "Stop listening" : "Start listening"}
            className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full transition ${
              speech.listening ? "bg-amber-300 text-black" : "bg-white/10 text-white hover:bg-white/20"
            } disabled:opacity-40`}
          >
            {speech.listening && <span className="absolute inset-0 animate-ping rounded-full bg-amber-300/40" />}
            {speech.supported ? <Mic className="relative h-5 w-5" /> : <MicOff className="relative h-5 w-5" />}
          </button>

          <div className="min-w-0 flex-1 text-lg max-sm:order-first max-sm:basis-full max-sm:px-2 max-sm:pt-1 max-sm:text-base" data-testid="transcript">
            {typing ? (
              <input
                autoFocus
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value);
                  guestTyped();
                  hear({ settled: "", unsettled: event.target.value }, { endOnSilence: false });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !typed.trim()) return;
                  hear({ settled: typed, unsettled: "" }, { endOnSilence: false });
                  endTurn();
                  setTyped("");
                }}
                enterKeyHint="send"
                placeholder="Type your order and press Enter"
                className="w-full bg-transparent text-white outline-none placeholder:text-white/30"
                data-testid="typed-input"
              />
            ) : words ? (
              <p className="truncate [direction:rtl] text-left">
                <bdi>
                  <span className="text-white">{transcript.settled}</span>{" "}
                  <span className="text-white/45">{transcript.unsettled}</span>
                </bdi>
              </p>
            ) : (
              <p className="truncate text-white/30">
                {transcript.previous || (speech.listening ? "Listening…" : "Tap the mic, or type your order")}
              </p>
            )}
          </div>

          {order.latency !== null && (
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs tabular-nums text-white/50 max-sm:hidden" title="Words to screen, last update" data-testid="latency">
              {order.latency} ms
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1 text-white/45 max-sm:ml-auto">
            <IconButton label={voice.enabled ? "Mute the waiter" : "Let the waiter speak"} active={voice.enabled} onClick={() => voice.setEnabled(!voice.enabled)}>
              {voice.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </IconButton>
            {voice.enabled && (
              <IconButton
                label={voice.headphones ? "Headphones on: speak to interrupt the waiter" : "On headphones? Turn on to interrupt the waiter by speaking"}
                active={voice.headphones}
                onClick={() => voice.setHeadphones(!voice.headphones)}
              >
                <Headphones className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton label={typing ? "Hide keyboard" : "Type instead"} active={typing} onClick={() => { stopDemo(); speech.stop(); setTyping((value) => !value); }}>
              <Keyboard className="h-4 w-4" />
            </IconButton>
            <IconButton label={playing ? "Stop demo" : "Play demo"} active={playing} onClick={playing ? stopDemo : playDemo}>
              {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Start over" onClick={startOver}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <p className="mt-2 min-h-4 text-center text-xs text-red-300/90 max-sm:mt-1 max-sm:empty:hidden" role="status">
          {problem ?? (!speech.supported ? "This browser has no speech recognition. Use Chrome, or type your order." : "")}
        </p>
      </footer>

      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 grid place-items-center bg-black/70 px-4 backdrop-blur-md"
            data-testid="summary"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151310] p-8 shadow-2xl max-sm:p-6"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Order ready</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">Here&apos;s your order</h2>
              <ul className="mt-6 max-h-[40dvh] space-y-3 overflow-y-auto pr-1">
                {priced.lines.map((line) => {
                  const extras = line.optionRows.filter((row) => !row.isDefault).map((row) => row.valueLabel);
                  return (
                    <li key={line.itemId} className="flex items-baseline gap-3">
                      <span className="w-6 text-white/40 tabular-nums">{line.qty}×</span>
                      <span className="flex-1">
                        {line.name}
                        {extras.length > 0 && <span className="block text-sm text-white/45">{extras.join(" · ")}</span>}
                      </span>
                      <span className="tabular-nums text-white/80">{formatPrice(line.lineTotal)}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 flex items-baseline justify-between border-t border-white/10 pt-4">
                <span className="text-white/50">
                  Total
                  <span className="block text-xs tabular-nums text-white/35">
                    about {priced.nutrition.kcal.toLocaleString("en-GB")} kcal · {priced.nutrition.protein}g protein
                  </span>
                </span>
                <span className="text-3xl font-semibold tabular-nums">{formatPrice(priced.total)}</span>
              </div>
              <div className="mt-6 flex justify-end">
                <PayButton restaurant={restaurant} priced={priced} />
              </div>
              <button
                onClick={startOver}
                className="mt-3 w-full rounded-full bg-amber-300 py-3 font-semibold text-black transition hover:bg-amber-200"
              >
                Start a new order
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function IconButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/10 hover:text-white ${active ? "bg-white/15 text-white" : ""}`}
    >
      {children}
    </button>
  );
}
