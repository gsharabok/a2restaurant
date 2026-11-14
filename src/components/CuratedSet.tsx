import { Check, Plus } from "lucide-react";
import { ItemImage } from "./ItemImage";
import { formatPrice } from "@/lib/format";
import type { Suggestion } from "@/lib/suggest";

/** A set of dishes proposed together to meet the guest's goal: the dishes, what they add up to, and one way to take them all. */
export function CuratedSet({ suggestion, note, onAccept }: { suggestion: Suggestion; note: string; onAccept: () => void }) {
  const { items, combo } = suggestion;
  if (!combo) return null;
  return (
    <div data-testid="curated-set">
      <div className="mx-auto max-w-4xl rounded-2xl border border-amber-200/25 bg-amber-200/[0.06] p-3 max-sm:p-2.5">
        {items.length > 0 && (
          <ul className="flex items-stretch justify-center gap-2 max-sm:flex-col max-sm:gap-1">
            {items.map((item, index) => (
              <li key={item.id} className="flex min-w-0 flex-1 items-center gap-2 max-sm:flex-none">
                {index > 0 && <Plus className="h-3.5 w-3.5 shrink-0 text-amber-200/50 max-sm:hidden" aria-hidden />}
                <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2 max-sm:py-1">
                  <ItemImage src={item.image} size={40} className="h-10 w-10 shrink-0 max-sm:h-8 max-sm:w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="truncate text-[11px] text-white/45 tabular-nums">
                      {item.protein}g protein · {item.kcal} kcal · {formatPrice(item.price)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className={`flex items-center gap-5 px-1 max-sm:gap-3 ${items.length > 0 ? "mt-3 max-sm:mt-2" : ""}`}>
          <dl className="flex min-w-0 flex-1 gap-6 max-sm:justify-between max-sm:gap-2">
            {combo.stats.map((stat) => (
              <div key={stat.label} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wider text-white/40">{stat.label}</dt>
                <dd className="flex items-center gap-1 text-lg font-semibold tabular-nums max-sm:text-base">
                  {stat.value}
                  {stat.met && <Check className="h-3.5 w-3.5 text-emerald-300" aria-label="goal met" />}
                </dd>
                <dd className={`truncate text-[11px] ${stat.goal ? (stat.met ? "text-emerald-200/70" : "text-red-300/80") : "text-white/0"}`}>{stat.goal ?? "-"}</dd>
              </div>
            ))}
          </dl>
          {items.length > 0 && (
            <button
              onClick={onAccept}
              className="shrink-0 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-200 max-sm:px-3"
              data-testid="curated-accept"
            >
              Add {items.length === 1 ? "it" : `all ${items.length}`}
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-white/30">
        {items.length > 0 && <span className="text-amber-200/70">say “yes, add them”</span>}
        {items.length > 0 && <span className="max-sm:hidden"> · </span>}
        {combo.withOrder ? "Totals include your order. " : ""}
        <span className="max-sm:hidden">{note}</span>
      </p>
    </div>
  );
}
