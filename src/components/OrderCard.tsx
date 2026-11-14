"use client";

import { AnimatePresence, motion } from "motion/react";
import type { PricedLine } from "@/lib/order";
import { formatPrice } from "@/lib/format";

export function OrderCard({ line, compact = false }: { line: PricedLine; compact?: boolean }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 28, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, filter: "blur(6px)" }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={`relative flex flex-col rounded-3xl border border-white/10 bg-white/[0.045] ${compact ? "w-[13rem] p-4" : "w-[16.5rem] p-5"} shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur`}
      data-testid={`card-${line.itemId}`}
    >
      <div className="flex items-start justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local SVGs, no optimisation needed */}
        <img src={line.image} alt="" className={`${compact ? "h-14 w-14" : "h-20 w-20"} drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)] transition-all`} />
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

      <h3 className="mt-3 text-lg font-semibold leading-tight text-white">{line.name}</h3>
      {!compact && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/45">{line.description}</p>}

      {line.optionRows.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          {line.optionRows.map((row) => (
            <div key={row.group} className="flex items-center gap-2">
              <span className={`w-10 shrink-0 text-[10px] uppercase tracking-wider text-white/35 ${compact ? "hidden" : ""}`}>{row.label}</span>
              <div className="flex gap-0.5">
                {row.values.map((value) => {
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

      <div className="mt-auto flex items-baseline justify-between pt-4">
        <span className="text-xs text-white/35">
          {line.qty > 1 ? `${formatPrice(line.unitPrice)} each` : line.pricePlaceholder ? "est. price" : ""}
        </span>
        <span className="text-lg font-semibold tabular-nums text-white">{formatPrice(line.lineTotal)}</span>
      </div>
    </motion.article>
  );
}
