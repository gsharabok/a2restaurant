"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import type { PricedLine } from "@/lib/order";
import { DrinkArt } from "./DrinkArt";
import { Steam } from "./Steam";

const SIZE_GROUPS = ["size", "portion"];

/** Where the chosen size sits among the sizes on offer: 0 smallest, 1 largest. Items without sizes are 1. */
function sizeLevel(line: PricedLine): number {
  const row = line.optionRows.find((option) => SIZE_GROUPS.includes(option.group));
  if (!row || row.values.length < 2) return 1;
  return row.values.findIndex((value) => value.id === row.value) / (row.values.length - 1);
}

/** Ice dropped into a photographed drink: where each cube enters, and where in the cup it lands and melts away. */
const CUBES = [
  { left: "30%", size: "20%", land: "150%", turn: -28 },
  { left: "50%", size: "22%", land: "170%", turn: 22 },
  { left: "41%", size: "17%", land: "120%", turn: 48 },
];

/**
 * The picture on an order card, alive to the order: it grows with the size, steams when hot and takes ice when cold.
 * Everything here is decoration on top of an order that has already been drawn, so nothing waits for an animation.
 */
export function ItemArt({ line, className = "" }: { line: PricedLine; className?: string }) {
  const photo = line.image.startsWith("http");
  const level = sizeLevel(line);
  const hot = line.temperature === "hot";
  const cold = line.temperature === "cold";

  if (line.art) {
    const option = (group: string) => line.optionRows.find((row) => row.group === group)?.value;
    return (
      <div className={`relative ${className}`} data-testid="item-art">
        <DrinkArt kind={line.art} iced={cold} level={level} milk={option("milk")} shots={option("shots")} />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} data-testid="item-art">
      {photo ? (
        <span className={`absolute inset-0 block overflow-hidden rounded-2xl bg-white/5 transition-shadow duration-500 ${cold ? "shadow-[0_0_0_1px_rgba(186,230,253,0.35),0_0_22px_-6px_rgba(125,211,252,0.55)]" : ""}`}>
          <motion.span
            className="absolute inset-0 block"
            style={{ originX: 0.5, originY: 0.62 }}
            initial={false}
            animate={{ scale: 1 + 0.22 * level }}
            transition={{ type: "spring", stiffness: 420, damping: 19 }}
          >
            {/* Every photo the options can switch to is already loaded underneath, so a change of option shows at once. */}
            {line.images.map((src) => (
              <Image
                key={src}
                src={src}
                alt=""
                fill
                sizes="224px"
                className={`object-cover transition-opacity duration-200 ${src === line.image ? "opacity-100" : "opacity-0"}`}
              />
            ))}
          </motion.span>
          {cold && <span key={line.image} className="frost-sweep absolute inset-0" />}
        </span>
      ) : (
        <motion.img
          src={line.image}
          alt=""
          className="absolute inset-0 h-full w-full drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
          style={{ originX: 0.5, originY: 1 }}
          initial={{ y: -18, scale: 0.6, rotate: -14 }}
          animate={{ y: 0, scale: 0.84 + 0.16 * level, rotate: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 17 }}
        />
      )}

      <AnimatePresence>
        {hot && (
          <motion.svg
            key="steam"
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            data-testid="steam"
          >
            <Steam x={50} y={photo ? 36 : 14} scale={photo ? 0.8 : 0.7} />
          </motion.svg>
        )}
        {cold && photo && (
          <motion.span key="ice" className="pointer-events-none absolute inset-0" exit={{ opacity: 0 }} transition={{ duration: 0.12 }} data-testid="ice">
            {CUBES.map((cube, index) => (
              <motion.span
                key={cube.left}
                className="ice-cube absolute top-0 aspect-square"
                style={{ left: cube.left, width: cube.size }}
                initial={{ y: "-160%", rotate: cube.turn - 90, opacity: 0 }}
                animate={{ y: cube.land, rotate: cube.turn, opacity: [0, 1, 1, 0] }}
                transition={{ duration: 0.62, delay: index * 0.09, ease: [0.5, 0, 0.9, 0.6], opacity: { duration: 0.62, delay: index * 0.09, times: [0, 0.12, 0.72, 1] } }}
              />
            ))}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
