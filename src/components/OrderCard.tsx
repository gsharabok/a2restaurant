"use client";

import { AnimatePresence, motion } from "motion/react";
import type { PricedLine } from "@/lib/order";
import { formatPrice } from "@/lib/format";
import { ItemArt } from "./ItemArt";

/** A long option list shows only the first few choices plus the one picked, so the card stays narrow. */
const visibleValues = (row: PricedLine["optionRows"][number]) =>
  row.values.length <= 4 ? row.values : row.values.filter((value, index) => index < 3 || value.id === row.value);

/** `snug` is for when a panel shares the screen: full width, but a smaller photo and no description. */
export type CardSize = "full" | "snug" | "compact";

export function OrderCard({ line, size = "full", detailed = false }: { line: PricedLine; size?: CardSize; detailed?: boolean }) {
  const compact = size === "compact";
  const { kcal, protein, carbs, fat } = line.nutrition;
  const photo = line.image.startsWith("http");
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 28, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, filter: "blur(6px)" }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={`relative flex flex-col rounded-3xl border border-white/10 bg-white/[0.045] ${compact ? "w-[13rem] p-4" : "w-[16.5rem] p-5"} [@media(max-height:780px)]:p-4 max-sm:w-[calc(50%-0.3125rem)] max-sm:rounded-2xl max-sm:p-3 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur`}
      data-testid={`card-${line.itemId}`}
    >
      <div className="flex items-start justify-between">
        <ItemArt line={line} className={`shrink-0 ${compact ? "h-14 w-14" : size === "snug" ? "h-20 w-20 [@media(max-height:780px)]:h-14 [@media(max-height:780px)]:w-14" : photo ? "h-28 w-28" : "h-20 w-20"} max-sm:h-14 max-sm:w-14 transition-all`} />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={line.qty}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
              line.qty > 1 ? "bg-amber-300 text-black" : "bg-white/10 text-white/70"
            }`}
            data-testid="qty"
          >
            ×{line.qty}
          </motion.span>
        </AnimatePresence>
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-tight text-white max-sm:mt-2 max-sm:text-base">{line.name}</h3>
      {size === "full" && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/45 max-sm:hidden">{line.description}</p>}

      <p className="mt-2 text-xs tabular-nums text-white/40 max-sm:mt-1" data-testid="nutrition-line">
        <span className="text-white/60">{kcal} kcal</span> · {protein}g protein
        <AnimatePresence initial={false}>
          {detailed && (
            <motion.span
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="block overflow-hidden text-amber-200/80"
            >
              {carbs}g carbs · {fat}g fat
            </motion.span>
          )}
        </AnimatePresence>
      </p>

      {line.optionRows.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3 [@media(max-height:780px)]:mt-2 [@media(max-height:780px)]:space-y-1 [@media(max-height:780px)]:pt-2">
          {line.optionRows.map((row) => (
            <div key={row.group} className="flex items-center gap-2">
              <span className={`w-10 shrink-0 text-[10px] uppercase tracking-wider text-white/35 max-sm:hidden ${compact ? "hidden" : ""}`}>{row.label}</span>
              <div className="flex flex-wrap gap-0.5">
                {visibleValues(row).map((value) => {
                  const active = value.id === row.value;
                  return (
                    <span
                      key={value.id}
                      className={`relative rounded-full px-2 py-0.5 text-[11px] transition-colors duration-300 ${
                        active ? "font-semibold text-black" : "text-white/35"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId={`pill-${line.itemId}-${row.group}`}
                          className="absolute inset-0 rounded-full bg-amber-300"
                          transition={{ type: "spring", stiffness: 500, damping: 34 }}
                        />
                      )}
                      <span className="relative">{value.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-baseline justify-between pt-4 [@media(max-height:780px)]:pt-2 max-sm:pt-2">
        <span className="text-xs text-white/35">
          {line.qty > 1 ? `${formatPrice(line.unitPrice)} each` : line.pricePlaceholder ? "est. price" : ""}
        </span>
        <span className="text-lg font-semibold tabular-nums text-white">{formatPrice(line.lineTotal)}</span>
      </div>
    </motion.article>
  );
}
