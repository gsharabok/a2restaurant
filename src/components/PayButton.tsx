"use client";

import { useImperativeHandle, useState, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X, Zap } from "lucide-react";
import type { PricedOrder } from "@/lib/order";
import { formatPrice } from "@/lib/format";

/** Lets the screen open the checkout when the guest asks to pay out loud. */
export type PayHandle = { pay: () => void };

type Props = { restaurant: { id: string; name: string }; priced: PricedOrder; className?: string; ref?: Ref<PayHandle> };

/** One-click pay. Opens Stripe's checkout when the server has a Stripe key, a demo checkout otherwise. */
export function PayButton({ restaurant, priced, className = "", ref }: Props) {
  const [state, setState] = useState<"idle" | "opening" | "demo" | "paid">("idle");
  const [error, setError] = useState<string | null>(null);

  /** `clicked` is false when the guest asked by voice: a browser only lets a click open a new tab, so Stripe opens in this one. */
  const pay = async (clicked: boolean) => {
    if (state !== "idle") return;
    setState("opening");
    setError(null);
    // Opened before the request so the browser treats it as the guest's click and doesn't block it.
    const tab = clicked ? window.open("", "_blank") : null;
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurant: restaurant.id, order: { lines: priced.lines.map(({ itemId, qty, options }) => ({ itemId, qty, options })) } }),
      });
      const data = (await response.json()) as { url?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Checkout failed.");
      if (data.url && tab) {
        tab.location.href = data.url;
        setState("idle");
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        tab?.close();
        setState("demo");
      }
    } catch (problem) {
      tab?.close();
      setError(problem instanceof Error ? problem.message : "Checkout failed.");
      setState("idle");
    }
  };

  useImperativeHandle(ref, () => ({ pay: () => void pay(false) }));

  return (
    <>
      <button
        onClick={() => pay(true)}
        disabled={state === "opening"}
        title={error ?? "Pay for this order"}
        className={`inline-flex items-center gap-1.5 rounded-full bg-[#00d66f] px-4 py-1.5 text-sm font-semibold text-[#011e0f] transition hover:bg-[#33e08a] disabled:opacity-60 ${className}`}
        data-testid="pay"
      >
        <Zap className="h-3.5 w-3.5 fill-current" />
        {error ? "Try again" : state === "opening" ? "Opening…" : "Pay with Link"}
      </button>

      <AnimatePresence>
        {(state === "demo" || state === "paid") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 grid place-items-center bg-black/70 text-left backdrop-blur-md"
            onClick={() => setState("idle")}
            data-testid="checkout"
          >
            <motion.div
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 16 }}
              onClick={(event) => event.stopPropagation()}
              className="relative w-full max-w-sm rounded-3xl bg-white p-7 text-[#1a1a1a] shadow-2xl"
            >
              <button onClick={() => setState("idle")} aria-label="Close checkout" className="absolute right-4 top-4 rounded-full p-1.5 text-black/40 hover:bg-black/5">
                <X className="h-4 w-4" />
              </button>
              {state === "paid" ? (
                <div className="py-6 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#00d66f] text-white">
                    <Check className="h-7 w-7" />
                  </span>
                  <p className="mt-4 text-xl font-semibold">Paid {formatPrice(priced.total)}</p>
                  <p className="mt-1 text-sm text-black/50">Thanks. Your order is with {restaurant.name}.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-black/50">Pay {restaurant.name}</p>
                  <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{formatPrice(priced.total)}</p>
                  <p className="mt-1 text-sm text-black/50">
                    {priced.count} item{priced.count === 1 ? "" : "s"}
                  </p>
                  <div className="mt-6 flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 text-sm">
                    <span className="text-black/50">Card</span>
                    <span className="font-medium tabular-nums">Visa •••• 4242</span>
                  </div>
                  <button
                    onClick={() => setState("paid")}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d66f] py-3 font-semibold text-[#011e0f] transition hover:bg-[#33e08a]"
                    data-testid="confirm-pay"
                  >
                    <Zap className="h-4 w-4 fill-current" />
                    Pay {formatPrice(priced.total)}
                  </button>
                  <p className="mt-3 text-center text-[11px] text-black/40">Demo checkout. No payment is taken.</p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
