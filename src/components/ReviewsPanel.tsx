"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Star, X } from "lucide-react";
import type { ReviewCard, ReviewSheet } from "@/lib/reviews";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Five stars that fill left to right up to `rating`, one after another when `animated`. */
function Stars({ rating, size, animated = false }: { rating: number; size: string; animated?: boolean }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, rating - index));
        return (
          <span key={index} className={`relative ${size}`}>
            <Star className="absolute inset-0 h-full w-full text-white/15" />
            <motion.span
              className="absolute inset-0 overflow-hidden"
              initial={animated ? { width: 0 } : false}
              animate={{ width: `${fill * 100}%` }}
              transition={{ delay: animated ? 0.25 + index * 0.09 : 0, duration: 0.35, ease: EASE }}
            >
              <Star className={`${size} fill-amber-300 text-amber-300`} />
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

function Review({ card, index }: { card: ReviewCard; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 + index * 0.08, duration: 0.4, ease: EASE }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
      data-testid="review-card"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-200/15 text-sm font-semibold text-amber-200">
          {card.author.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.author}</p>
          <p className="truncate text-[11px] text-white/40">{card.info || "Google review"}</p>
        </div>
        <div className="shrink-0 text-right">
          <Stars rating={card.rating} size="h-3 w-3" />
          <p className="mt-0.5 text-[11px] text-white/40">{card.when}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/80">{card.text}</p>
      {card.photos.length > 0 && (
        <div className="mt-3 flex gap-2">
          {card.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element -- guest photos are served by Google at a fixed size
            <img key={photo} src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-28 rounded-xl object-cover" onError={(event) => (event.currentTarget.style.display = "none")} />
          ))}
        </div>
      )}
      {card.reply && (
        <p className="mt-3 border-l-2 border-amber-200/30 pl-3 text-xs leading-relaxed text-white/50">
          <span className="font-medium text-white/70">Reply from the owner: </span>
          {card.reply}
        </p>
      )}
    </motion.li>
  );
}

/**
 * The reviews the guest asked for. It sits over the order but under the control bar,
 * so the guest can keep talking: asking about something else swaps the sheet, ordering closes it.
 */
export function ReviewsPanel({ sheet, onClose }: { sheet: ReviewSheet | null; onClose: () => void }) {
  useEffect(() => {
    if (!sheet) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, onClose]);

  const total = sheet ? Math.max(1, sheet.distribution.reduce((sum, count) => sum + count, 0)) : 1;

  return (
    <AnimatePresence>
      {sheet && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-6 pb-28 pt-6 backdrop-blur-md max-sm:items-end max-sm:px-3 max-sm:pb-32 max-sm:pt-3"
          onClick={onClose}
          data-testid="reviews"
        >
          <motion.section
            key={sheet.key}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.45, ease: EASE }}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Reviews of ${sheet.title}`}
            className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#141210] shadow-2xl"
          >
            <button onClick={onClose} aria-label="Close reviews" className="absolute right-4 top-4 z-10 rounded-full bg-black/40 p-2 text-white/60 backdrop-blur hover:text-white">
              <X className="h-4 w-4" />
            </button>

            <div className="flex min-h-0 flex-1 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin] max-sm:flex-col max-sm:overflow-y-auto">
              <div className="w-80 shrink-0 border-r border-white/10 p-6 max-sm:w-full max-sm:border-b max-sm:border-r-0 max-sm:p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Google reviews</p>
                <h2 className="mt-1 pr-8 text-2xl font-semibold tracking-tight" data-testid="reviews-title">{sheet.title}</h2>
                <div className="mt-4 flex items-end gap-3">
                  <motion.p
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
                    className="text-6xl font-semibold tabular-nums leading-none tracking-tight max-sm:text-5xl"
                    data-testid="reviews-rating"
                  >
                    {sheet.rating.toFixed(1)}
                  </motion.p>
                  <div className="pb-1">
                    <Stars rating={sheet.rating} size="h-5 w-5" animated />
                    <p className="mt-1 text-xs text-white/45">{sheet.countLabel}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-1.5">
                  {sheet.distribution.map((count, index) => (
                    <div key={index} className="flex items-center gap-2 text-[11px] tabular-nums text-white/45">
                      <span className="w-2">{5 - index}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <motion.span
                          className="block h-full rounded-full bg-amber-300"
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / total) * 100}%` }}
                          transition={{ delay: 0.3 + index * 0.07, duration: 0.6, ease: EASE }}
                        />
                      </span>
                      <span className="w-7 text-right">{count}</span>
                    </div>
                  ))}
                </div>

                {sheet.positiveShare !== null && (
                  <p className="mt-4 text-xs text-white/50">
                    <span className="font-semibold text-emerald-300">{Math.round(sheet.positiveShare * 100)}%</span> gave 4 or 5 stars
                  </p>
                )}

                {sheet.photos.length > 0 && (
                  <div className="mt-5 grid grid-cols-4 gap-1.5 max-sm:hidden">
                    {sheet.photos.map((photo, index) => (
                      <motion.img
                        key={photo}
                        src={photo}
                        alt=""
                        referrerPolicy="no-referrer"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + index * 0.08, duration: 0.35 }}
                        className="aspect-square w-full rounded-lg object-cover"
                        onError={(event) => (event.currentTarget.style.display = "none")}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-5 max-sm:hidden">
                  <p className="text-[10px] uppercase tracking-wider text-white/35">Ask about</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sheet.topics.map((topic) => (
                      <span key={topic.label} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-white/55">
                        {topic.label} <span className="tabular-nums text-amber-200/80">{topic.rating.toFixed(1)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-6 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin] max-sm:overflow-visible max-sm:p-4">
                {sheet.summary && (
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, duration: 0.4 }}
                    className="pr-8 text-lg leading-snug text-amber-100/90 max-sm:pr-0 max-sm:text-base"
                    data-testid="reviews-summary"
                  >
                    {sheet.summary}
                  </motion.p>
                )}
                {sheet.quotes.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {sheet.quotes.map((quote, index) => (
                      <motion.span
                        key={quote.text}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.35 + index * 0.07 }}
                        className="rounded-2xl bg-amber-200/10 px-3 py-1.5 text-xs text-amber-100/85"
                      >
                        “{quote.text}” <span className="text-amber-100/45">{quote.author}</span>
                      </motion.span>
                    ))}
                  </div>
                )}
                <ul className="mt-4 space-y-3">
                  {sheet.cards.map((card, index) => (
                    <Review key={`${card.author}-${index}`} card={card} index={index} />
                  ))}
                </ul>
                <p className="mt-4 text-[11px] leading-relaxed text-white/30">
                  {sheet.sourceNote}{" "}
                  <a href={sheet.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-white/60">
                    See it on Google Maps
                  </a>
                </p>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
