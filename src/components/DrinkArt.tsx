"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { DrinkArtKind } from "@/lib/menu";
import { Steam } from "./Steam";

type Props = {
  kind: DrinkArtKind;
  iced: boolean;
  /** 0 for the smallest size, 1 for the largest. */
  level: number;
  milk?: string;
  shots?: string;
};

const mix = (a: string, b: string, t: number) => {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t).toString(16).padStart(2, "0")).join("")}`;
};

const ESPRESSO = "#24130b";
/** `top` is the surface in a cup, and the upper part of an iced glass, where the coffee sits above the milk. */
const LIQUID: Record<DrinkArtKind, { top: string; bottom: string; foam: string }> = {
  black: { top: "#3b2317", bottom: "#6a4226", foam: "#8a5a36" },
  milky: { top: "#b07a4d", bottom: "#ead6b8", foam: "#f6e8cf" },
  foamy: { top: "#a8744a", bottom: "#e6cfae", foam: "#f3e4c8" },
  chocolate: { top: "#6a3f28", bottom: "#b98d68", foam: "#d9b891" },
};
const MILK_TINT: Record<string, string> = { oat: "#d2ab74", almond: "#dcbf92", soya: "#e3cfa2", skimmed: "#f7f2ea", coconut: "#fbf8f1" };
const CREAM = "#fff7e8";

const ICE = [
  { x: 50, y: 50, turn: -14, size: 17, bob: 3.1 },
  { x: 69, y: 55, turn: 17, size: 16, bob: 3.7 },
  { x: 58, y: 71, turn: 7, size: 17, bob: 4.3 },
  { x: 65, y: 37, turn: -24, size: 15, bob: 2.7 },
];

const spring = { type: "spring", stiffness: 380, damping: 22 } as const;

/** A cup or an iced glass drawn from the order line: its size, its milk, its shots, and whether it steams or holds ice. */
export function DrinkArt({ kind, iced, level, milk, shots }: Props) {
  // What changed since the last draw decides what is poured in; the ice shifts with every change.
  const [seen, setSeen] = useState({ milk, shots, level });
  const [pour, setPour] = useState({ count: 0, colour: ESPRESSO });
  if (seen.milk !== milk || seen.shots !== shots || seen.level !== level) {
    setSeen({ milk, shots, level });
    const milkChanged = seen.milk !== milk && kind !== "black";
    setPour({ count: pour.count + 1, colour: seen.level !== level ? "" : milkChanged ? CREAM : ESPRESSO });
  }

  const base = LIQUID[kind];
  const tint = kind !== "black" && milk && MILK_TINT[milk];
  const shade = (colour: string, tintAmount: number) => {
    const tinted = tint ? mix(colour, tint, tintAmount) : colour;
    return shots === "extra" ? mix(tinted, ESPRESSO, 0.28) : tinted;
  };
  const top = shade(base.top, 0.3);
  const bottom = shade(base.bottom, 0.45);
  const foam = tint ? mix(base.foam, tint, 0.3) : base.foam;
  // Two cards can hold the same kind of drink in different colours, so each needs its own gradients.
  const id = `drink-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <motion.div
      className="absolute inset-0"
      style={{ originX: 0.5, originY: 1 }}
      initial={false}
      animate={{ scale: 0.86 + 0.14 * level }}
      transition={{ type: "spring", stiffness: 420, damping: 17 }}
    >
      <AnimatePresence initial={false}>
        {iced ? (
          <motion.svg
            key="iced"
            viewBox="7 12 106 106"
            className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.16 }}
            data-testid="drink-iced"
          >
            <defs>
              <linearGradient id={`${id}-iced`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={mix(top, ESPRESSO, 0.3)} className="drink-fill" />
                <stop offset="0.45" stopColor={mix(top, bottom, 0.45)} className="drink-fill" />
                <stop offset="1" stopColor={bottom} className="drink-fill" />
              </linearGradient>
              <clipPath id={`${id}-glass`}>
                <path d="M36 24 L41.5 100 Q42 104 46 104 L74 104 Q78 104 78.5 100 L84 24 Z" />
              </clipPath>
            </defs>
            <line x1="76" y1="3" x2="61" y2="98" stroke="#fcd34d" strokeWidth="5" strokeLinecap="round" />
            <g clipPath={`url(#${id}-glass)`}>
              <motion.g initial={{ y: 70 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
                <rect x="30" y="38" width="60" height="140" fill={`url(#${id}-iced)`} opacity="0.93" />
                {kind !== "black" && (
                  <path className="drink-swirl" d="M38 78 C48 66 54 86 62 74 S76 70 82 82 L82 104 L38 104 Z" fill={CREAM} opacity="0.28" />
                )}
                <ellipse cx="60" cy="38" rx="24" ry="3.6" fill={mix(top, "#ffffff", 0.22)} className="drink-fill" />
                {pour.count > 0 && (
                  <ellipse key={pour.count} className="drink-ripple" cx="60" cy="38" rx="20" ry="3" fill="none" stroke="#fff" strokeWidth="1.2" />
                )}
              </motion.g>
              {ICE.map((cube, index) => (
                <motion.g
                  key={index}
                  initial={{ y: -90, rotate: cube.turn - 50 }}
                  animate={{ y: 0, rotate: cube.turn + (pour.count % 2 ? (index % 2 ? 11 : -11) : 0) }}
                  transition={{ ...spring, delay: pour.count === 0 ? 0.1 + index * 0.07 : index * 0.02 }}
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                >
                  <g className="drink-ice" style={{ animationDuration: `${cube.bob}s`, animationDelay: `${-index * 0.9}s` }}>
                    <rect
                      x={cube.x - cube.size / 2}
                      y={cube.y - cube.size / 2}
                      width={cube.size}
                      height={cube.size}
                      rx="4"
                      fill="rgba(255,255,255,0.34)"
                      stroke="rgba(255,255,255,0.85)"
                      strokeWidth="1.1"
                    />
                    <path
                      d={`M${cube.x - cube.size / 2 + 3.5} ${cube.y + 2} v-5.5 q0 -3 3 -3 h5`}
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      opacity="0.75"
                    />
                  </g>
                </motion.g>
              ))}
            </g>
            <path d="M36 24 L41.5 100 Q42 104 46 104 L74 104 Q78 104 78.5 100 L84 24 Z" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.6" strokeLinejoin="round" />
            <ellipse cx="60" cy="24" rx="24" ry="3.6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" />
            <path d="M42 33 L46.5 94" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
            <circle cx="73.5" cy="62" r="1.3" fill="#fff" opacity="0.55" />
            <circle cx="49" cy="84" r="1.1" fill="#fff" opacity="0.5" />
            <circle className="drink-drop" cx="76" cy="46" r="1.5" fill="#fff" opacity="0.7" />
            {pour.count > 0 && pour.colour && <rect key={pour.count} className="drink-pour" x="45" y="-6" width="3.2" height="46" rx="1.6" fill={pour.colour} />}
          </motion.svg>
        ) : (
          <motion.svg
            key="hot"
            viewBox="7 12 106 106"
            className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.16 }}
            data-testid="drink-hot"
          >
            <defs>
              <linearGradient id={`${id}-cup`} x1="0" y1="0" x2="1" y2="0.4">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.55" stopColor="#f0f3f6" />
                <stop offset="1" stopColor="#c3ccd6" />
              </linearGradient>
              <radialGradient id={`${id}-surface`} cx="0.42" cy="0.4" r="0.75">
                <stop offset="0" stopColor={mix(top, "#ffffff", 0.14)} className="drink-fill" />
                <stop offset="1" stopColor={mix(top, "#000000", 0.18)} className="drink-fill" />
              </radialGradient>
            </defs>
            <ellipse cx="60" cy="104" rx="50" ry="10" fill="#dfe5eb" />
            <ellipse cx="60" cy="102.5" rx="50" ry="9.5" fill="#f8fafb" />
            <ellipse cx="60" cy="102" rx="33" ry="5.5" fill="#d3dae2" />
            <path d="M94 64 C117 59 116 88 87 88" fill="none" stroke="#dde3ea" strokeWidth="8" strokeLinecap="round" />
            <path d="M20 56 C20 84 36 101 60 101 C84 101 100 84 100 56 Z" fill={`url(#${id}-cup)`} />
            <ellipse cx="60" cy="56" rx="40" ry="11.5" fill="#fbfcfd" />
            <ellipse cx="60" cy="57" rx="35.5" ry="8.8" fill={`url(#${id}-surface)`} />
            <g transform="translate(60 57) scale(1 0.248)">
              {kind === "milky" && (
                <g fill={foam} className="drink-fill">
                  <path d="M0 24 C-28 4 -24 -20 -9 -19 C-3 -18 0 -13 0 -9 C0 -13 3 -18 9 -19 C24 -20 28 4 0 24 Z" />
                  <path d="M-15 -22 Q0 -34 15 -22 Q0 -27 -15 -22 Z" opacity="0.8" />
                </g>
              )}
              {kind === "foamy" && (
                <>
                  <circle r="29" fill={foam} className="drink-fill" />
                  {[[-9, -8], [6, -12], [12, 4], [-3, 9], [-14, 6], [1, -1]].map(([x, y]) => (
                    <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill="#7a4a2b" opacity="0.55" />
                  ))}
                </>
              )}
              {kind === "chocolate" && (
                <path d="M0 0 C8 -10 20 0 10 12 C-2 24 -24 10 -18 -8 C-13 -24 14 -28 24 -10" fill="none" stroke={foam} strokeWidth="5" strokeLinecap="round" className="drink-fill" />
              )}
              {kind === "black" && (
                <g fill={base.foam} opacity="0.8">
                  <circle cx="-14" cy="6" r="3.2" />
                  <circle cx="-7" cy="12" r="2.2" />
                  <circle cx="-19" cy="-2" r="1.8" />
                </g>
              )}
            </g>
            <path d="M30 55 Q44 50 62 50.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.28" />
            {pour.count > 0 && (
              <ellipse key={`ripple${pour.count}`} className="drink-ripple" cx="60" cy="57" rx="30" ry="7.2" fill="none" stroke="#fff" strokeWidth="1.2" />
            )}
            {pour.count > 0 && pour.colour && <rect key={pour.count} className="drink-pour" x="58.4" y="-2" width="3.2" height="59" rx="1.6" fill={pour.colour} />}
            <Steam x={60} y={44} />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
