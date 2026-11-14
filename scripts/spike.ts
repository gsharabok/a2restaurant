/**
 * Interpreter check: runs scripted guest turns through Jev and reports accuracy and latency.
 * Usage: npm run spike            (reads TYPESAFE_API_KEY from .env.local)
 */
import fs from "node:fs";
import { interpret } from "../src/lib/interpret";
import type { Order } from "../src/lib/order";

const key =
  process.env.TYPESAFE_API_KEY ??
  fs.readFileSync(".env.local", "utf8").match(/TYPESAFE_API_KEY=(.*)/)?.[1]?.trim();
if (!key) throw new Error("Set TYPESAFE_API_KEY in .env.local");

type Case = {
  name: string;
  before?: string[];
  said: string;
  shown?: string[];
  expect: string[];
  suggest?: string | null;
  accepted?: number | null;
  done?: boolean;
};

// Compact line syntax: "2 latte milk=oat temp=iced"
const parse = (lines: string[]): Order => ({
  lines: lines.map((text) => {
    const [qty, itemId, ...rest] = text.split(" ");
    return { qty: Number(qty), itemId, options: Object.fromEntries(rest.map((pair) => pair.split("="))) };
  }),
});
const NON_DEFAULT: Record<string, string> = { milk: "whole", temp: "hot", size: "regular", shots: "standard", portion: "regular" };
const show = (order: Order) =>
  order.lines
    .map((line) =>
      [line.qty, line.itemId, ...Object.entries(line.options).filter(([g, v]) => NON_DEFAULT[g] !== v).map(([g, v]) => `${g}=${v}`).sort()].join(" "),
    )
    .sort();

const cases: Case[] = [
  { name: "demo 1: full sentence", said: "Can I get the poached eggs with a side of bacon, an almond croissant, and a flat white", expect: ["1 poached_eggs", "1 side_bacon", "1 almond_croissant", "1 flat_white"] },
  { name: "demo 1: mid-sentence", said: "Can I get the poached eggs with a side of", expect: ["1 poached_eggs"] },
  { name: "demo 1: cut after bacon", said: "Can I get the poached eggs with a side of bacon, and", expect: ["1 poached_eggs", "1 side_bacon"] },
  { name: "demo 2: swap coffee, drop bacon, add avocado", before: ["1 poached_eggs", "1 side_bacon", "1 almond_croissant", "1 flat_white"], said: "Actually make that an iced latte with oat milk. And no bacon, add avocado", expect: ["1 poached_eggs", "1 almond_croissant", "1 latte milk=oat temp=iced", "1 side_avocado"] },
  { name: "demo 2: mid-sentence swap", before: ["1 poached_eggs", "1 side_bacon", "1 almond_croissant", "1 flat_white"], said: "Actually make that an iced latte", expect: ["1 poached_eggs", "1 side_bacon", "1 almond_croissant", "1 latte temp=iced"] },
  { name: "demo 3: ask for healthy", before: ["1 poached_eggs", "1 almond_croissant", "1 latte milk=oat temp=iced", "1 side_avocado"], said: "I want something healthy too", expect: ["1 poached_eggs", "1 almond_croissant", "1 latte milk=oat temp=iced", "1 side_avocado"], suggest: "healthy" },
  { name: "demo 3: accept first suggestion", before: ["1 poached_eggs", "1 latte milk=oat temp=iced"], shown: ["fruit_salad", "granola", "goats_curd_salad"], said: "Add the first one", expect: ["1 poached_eggs", "1 latte milk=oat temp=iced", "1 fruit_salad"], accepted: 1 },
  { name: "demo 4: done", before: ["1 poached_eggs", "1 latte milk=oat temp=iced"], said: "That's it, thanks", expect: ["1 poached_eggs", "1 latte milk=oat temp=iced"], done: true },
  { name: "brief: eggs bacon coffee", said: "I'm gonna have some eggs, maybe a little bit of bacon, and then a coffee", expect: ["1 poached_eggs", "1 side_bacon", "1 flat_white"] },
  { name: "quantities", said: "Two flat whites and three almond croissants please", expect: ["2 flat_white", "3 almond_croissant"] },
  { name: "options in one go", said: "A large oat milk latte with an extra shot and a banana bread", expect: ["1 latte milk=oat shots=extra size=large", "1 banana_bread"] },
  { name: "change size only", before: ["1 latte milk=oat", "1 banana_bread"], said: "Change the coffee to large", expect: ["1 latte milk=oat size=large", "1 banana_bread"] },
  { name: "change milk only", before: ["1 cappuccino", "1 croissant"], said: "Can I have almond milk in that", expect: ["1 cappuccino milk=almond", "1 croissant"] },
  { name: "increase quantity", before: ["1 almond_croissant", "1 flat_white"], said: "Make it two croissants", expect: ["2 almond_croissant", "1 flat_white"] },
  { name: "remove item", before: ["1 eggs_benedict", "1 orange_juice", "1 brownie"], said: "Actually, scrap the brownie", expect: ["1 eggs_benedict", "1 orange_juice"] },
  { name: "self-correction in one turn", said: "A cappuccino, no wait, a mocha, and a pain au chocolat", expect: ["1 mocha", "1 pain_au_chocolat"] },
  { name: "chit-chat adds nothing", before: ["1 flat_white"], said: "Hmm, let me think for a second", expect: ["1 flat_white"] },
  { name: "ask what's popular", said: "What's the most popular thing here?", expect: [], suggest: "popular" },
  { name: "not on menu", said: "Can I get some hash browns", expect: [] },
  { name: "similar dishes", said: "Eggs royale and an avo smash with a side of smoked salmon", expect: ["1 eggs_royale", "1 avo_smash", "1 side_salmon"] },
];

async function main() {
  let passed = 0;
  const times: number[] = [];
  for (const test of cases) {
    const result = await interpret({ before: parse(test.before ?? []), said: test.said, shownSuggestions: test.shown, apiKey: key! });
    times.push(result.ms);
    const got = show(result.order);
    const want = show(parse(test.expect));
    const ok =
      JSON.stringify(got) === JSON.stringify(want) &&
      (test.suggest === undefined || result.suggest === test.suggest) &&
      (test.accepted === undefined || result.accepted === test.accepted) &&
      (test.done === undefined || result.done === test.done) &&
      (test.suggest !== undefined || result.suggest === null);
    if (ok) passed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${String(result.ms).padStart(4)}ms  ${test.name}`);
    if (!ok) {
      console.log(`       said: ${test.said}`);
      console.log(`       want: ${want.join(" | ")}  suggest=${test.suggest ?? null} accepted=${test.accepted ?? null} done=${test.done ?? false}`);
      console.log(`       conf: ${Object.entries(result.confidences).map(([id, c]) => `${id}=${c.toFixed(2)}`).join(" ")}`);
      console.log(`       got:  ${got.join(" | ")}  suggest=${result.suggest} accepted=${result.accepted} done=${result.done}`);
    }
  }
  times.sort((a, b) => a - b);
  console.log(`\n${passed}/${cases.length} passed. Latency per call: median ${times[Math.floor(times.length / 2)]}ms, max ${times[times.length - 1]}ms`);
  if (passed < cases.length) process.exitCode = 1;
}
main();
