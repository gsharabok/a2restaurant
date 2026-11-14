import type { Menu, MenuItem } from "./menu";
import { defaultOptions, priceOrder, type Order } from "./order";
import type { Suggestion } from "./suggest";
import { formatPrice } from "./format";
import { sayPrice } from "./waiterSay";
import { ask, type Question } from "./interpret";

export type Metric = "protein" | "kcal" | "carbs" | "fat" | "price";
/** `min`: at least; `max`: no more than; `about`: within 10% either way. */
export type Goal = { metric: Metric; op: "min" | "max" | "about"; value: number };
/** What the guest asked the meal to add up to. `most` is "high protein" said without a number. */
export type Goals = { goals: Goal[]; most?: "protein" };

/** A proposed set of dishes that together meet the guest's goals, accepted as a whole. */
export type Combo = {
  /** The request the set answers, sent back with the next turn so "make it vegetarian" can refine it. */
  ask: string;
  /** Totals for the whole meal: the proposed dishes plus anything already ordered. */
  stats: { label: string; value: string; goal?: string; met?: boolean }[];
  /** False when the menu cannot reach the goals and this is the closest set. */
  met: boolean;
  /** True when the totals include dishes already in the order. */
  withOrder: boolean;
  /** The waiter's spoken line. */
  say: string;
};

export const MAX_COMBO = 4;

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
// Longest first and whole words only, or "sixty" is read as "six" + "ty".
const NUMBER_WORDS = [...SMALL, ...TENS.filter(Boolean), "hundred", "thousand"].sort((a, b) => b.length - a.length).join("|");
const NUMBER_WORD = new RegExp(`\\b(?:(?:${NUMBER_WORDS})\\b(?:[\\s-]+(?:and[\\s-]+)?)?)+`, "g");

/** "six hundred and fifty" -> 650, so typed and spoken numbers read the same. */
function wordsToNumber(words: string): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const word of words.split(/[\s-]+/)) {
    if (word === "and" || !word) continue;
    const small = SMALL.indexOf(word);
    const tens = TENS.indexOf(word);
    if (small >= 0) current += small;
    else if (tens >= 2) current += tens * 10;
    else if (word === "hundred") current = (current || 1) * 100;
    else if (word === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    } else return null;
    seen = true;
  }
  return seen ? total + current : null;
}

const normalise = (said: string) =>
  said
    .toLowerCase()
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\b(a|an)\s+(hundred|thousand)\b/g, "one $2")
    .replace(NUMBER_WORD, (match) => {
      const value = wordsToNumber(match.trim());
      return value === null ? match : `${value}${/\s$/.test(match) ? " " : ""}`;
    });

const NUM = "(\\d+(?:\\.\\d+)?)";
const GRAMS = "\\s*(?:g|gs|grams?|gram's)?\\s*(?:of\\s+)?";
const PATTERNS: { metric: Metric; pattern: RegExp }[] = [
  { metric: "protein", pattern: new RegExp(`${NUM}${GRAMS}protein`, "g") },
  { metric: "carbs", pattern: new RegExp(`${NUM}${GRAMS}(?:net\\s+)?carb`, "g") },
  { metric: "fat", pattern: new RegExp(`${NUM}${GRAMS}fat`, "g") },
  { metric: "kcal", pattern: new RegExp(`${NUM}\\s*(?:k?cals?\\b|calorie|kilocalorie)`, "g") },
  { metric: "price", pattern: new RegExp(`[£$€]\\s*${NUM}`, "g") },
  { metric: "price", pattern: new RegExp(`${NUM}\\s*(?:pounds?\\b|quid|£|dollars?|bucks?|euros?)`, "g") },
];
const BEFORE_MAX = /(?:under|below|(?<!\b(?:no|not) )less than|fewer than|at most|max|maximum|no more than|not more than|up to|within|not over|budget of|only have|i have|i've got|i got|keep (?:it|that|this) to|limit of|cap of|top out at)(?: of)?(?: about| around)?\s*[£$€]?$/;
const BEFORE_MIN = /(?:at least|(?<!\bnot )over|(?<!\b(?:no|not) )more than|above|min|minimum|no less than|not less than|north of)(?: of)?(?: about| around)?\s*[£$€]?$/;
const BEFORE_ABOUT = /(?:about|around|roughly|approximately|approx|close to|near|nearly|circa|~)\s*[£$€]?$/;
const AFTER_MAX = /^[\w\s]{0,14}?\b(?:or less|or fewer|or under|or below|max|maximum|tops)\b/;
const AFTER_MIN = /^[\w\s]{0,14}?\b(?:or more|or over|or above|minimum|plus)\b/;
/** Where the words after a number stop being about it: the next clause or the next number. */
const NEXT_CLAUSE = /[,.;]|\band\b|\bbut\b|\bwith\b|\d/;

/** Reads the numbers the meal has to add up to. Null when the guest named none, which is every ordinary turn. */
export function parseGoals(said: string): Goals | null {
  const text = normalise(said);
  const found = new Map<Metric, Goal & { at: number }>();
  for (const { metric, pattern } of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      const at = match.index ?? 0;
      const before = text.slice(Math.max(0, at - 40), at).trimEnd();
      const after = text.slice(at + match[0].length, at + match[0].length + 40).split(NEXT_CLAUSE)[0];
      // The word in front of the number is the stronger sign; what follows it only counts within the same clause.
      const op: Goal["op"] = BEFORE_MIN.test(before)
        ? "min"
        : BEFORE_MAX.test(before)
          ? "max"
          : AFTER_MAX.test(after)
            ? "max"
            : AFTER_MIN.test(after)
              ? "min"
              : BEFORE_ABOUT.test(before)
                ? metric === "price" ? "max" : "about"
                : metric === "protein" ? "min" : "max";
      // "Zero carbs" is a ceiling; zero of anything else is not a goal.
      if (!(value > 0) && !(value === 0 && op !== "min" && (metric === "carbs" || metric === "fat"))) continue;
      // Said twice, the later number is the correction.
      const earlier = found.get(metric);
      if (!earlier || at > earlier.at) found.set(metric, { metric, op, value, at });
    }
  }
  if (found.size === 0) return null;
  const goals = [...found.values()].map(({ metric, op, value }) => ({ metric, op, value }));
  const most = !found.has("protein") && /(?:high|more|most|much|max\w*|lots of|plenty of)[\s-]+(?:\w+\s+)?protein|protein[\s-]+(?:rich|packed|heavy)/.test(text) ? ("protein" as const) : undefined;
  return most ? { goals, most } : { goals };
}

const kind = (item: MenuItem) => (item.category === "drink" || item.category === "pastry" || item.category === "side" ? item.category : "main");
const MAINS = (item: MenuItem) => kind(item) === "main";
const UNIT: Record<Metric, (value: number) => string> = {
  protein: (v) => `${v} g`,
  carbs: (v) => `${v} g`,
  fat: (v) => `${v} g`,
  kcal: (v) => `${v.toLocaleString("en-GB")} kcal`,
  price: (v) => formatPrice(v),
};
const LABEL: Record<Metric, string> = { protein: "Protein", kcal: "Calories", carbs: "Carbs", fat: "Fat", price: "Price" };
const SPOKEN: Record<Metric, (value: number) => string> = {
  protein: (v) => `${v} ${v === 1 ? "gram" : "grams"} of protein`,
  carbs: (v) => `${v} ${v === 1 ? "gram" : "grams"} of carbs`,
  fat: (v) => `${v} ${v === 1 ? "gram" : "grams"} of fat`,
  kcal: (v) => `${v.toLocaleString("en-GB")} calories`,
  price: (v) => sayPrice(v),
};
const isMet = (goal: Goal, value: number) =>
  goal.op === "min" ? value >= goal.value : goal.op === "max" ? value <= goal.value : Math.abs(value - goal.value) <= goal.value * 0.1;

const spoken = (name: string) => name.replace(/\s*&\s*/g, " and ").replace(/[®™]/g, "").toLowerCase();
const list = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/**
 * Picks the set of dishes that best meets the goals. Every figure is added up in code from the
 * menu's nutrition and prices, with each dish at its default options; no model does the sums.
 * `allowed` are the dishes the guest's diet permits; `wanted` are groups of which one dish each must be in the set.
 */
export function curate(input: { menu: Menu; order: Order; ask: string; goals: Goals; allowed?: Set<string>; wanted?: string[][] }): Suggestion {
  const { menu, goals } = input;
  const base = priceOrder(menu, input.order);
  const ordered = new Set(base.lines.map((line) => line.itemId));
  const amount = (totals: Record<Metric, number>, metric: Metric) => totals[metric];
  const baseTotals: Record<Metric, number> = { protein: base.nutrition.protein, kcal: base.nutrition.kcal, carbs: base.nutrition.carbs, fat: base.nutrition.fat, price: base.total };

  const pool = menu.items
    .filter((item) => !ordered.has(item.id) && (!input.allowed || input.allowed.has(item.id)))
    .map((item) => {
      const line = priceOrder(menu, { lines: [{ itemId: item.id, qty: 1, options: defaultOptions(menu, item) }] }).lines[0];
      return { item, line, add: { protein: line.nutrition.protein, kcal: line.nutrition.kcal, carbs: line.nutrition.carbs, fat: line.nutrition.fat, price: line.unitPrice } as Record<Metric, number> };
    });
  // A kind of dish the guest asked for and already has in the order is not asked for again.
  const wanted = (input.wanted ?? []).filter((group) => !group.some((id) => ordered.has(id))).map((group) => group.filter((id) => pool.some((entry) => entry.item.id === id))).filter((group) => group.length > 0);

  const hard = goals.goals.filter((goal) => goal.op === "max");
  const soft = goals.goals.filter((goal) => goal.op !== "max");
  const orderHasMain = base.lines.some((line) => MAINS(menu.itemsById.get(line.itemId)!));
  const orderHasDrink = base.lines.some((line) => line.category === "drink");
  // With nothing to reach, a ceiling is read as "a meal about this big": calories first, otherwise the budget.
  const fill = soft.length === 0 && !goals.most ? (hard.find((goal) => goal.metric === "kcal") ?? hard.find((goal) => goal.metric === "price")) : undefined;

  const alreadyMet = base.lines.length > 0 && soft.length > 0 && !goals.most && goals.goals.every((goal) => isMet(goal, amount(baseTotals, goal.metric)));

  type Entry = (typeof pool)[number];
  let best: { set: Entry[]; totals: Record<Metric, number>; score: number } | null = null;
  const consider = (set: Entry[], totals: Record<Metric, number>) => {
    if (wanted.some((group) => !set.some((entry) => group.includes(entry.item.id)))) return;
    const mains = set.filter((entry) => MAINS(entry.item)).length;
    const sides = set.filter((entry) => entry.item.category === "side").length;
    if (sides > 0 && mains === 0 && !orderHasMain) return;
    let score = set.length * 0.08 + totals.price / 200 + totals.kcal / 20000;
    for (const goal of soft) {
      const value = amount(totals, goal.metric);
      const off = Math.abs(value - goal.value) / Math.max(goal.value, 1);
      score += isMet(goal, value) ? off : 10 + off * 10;
    }
    if (goals.most) score -= totals[goals.most] / 40;
    if (fill) score += (Math.abs(fill.value - totals[fill.metric]) / fill.value) * 0.6;
    if (mains > 0 || orderHasMain) score -= 0.2;
    if (set.some((entry) => entry.item.category === "drink") && !orderHasDrink) score -= 0.03;
    if (!best || score < best.score) best = { set: [...set], totals: { ...totals }, score };
  };
  const count = { drink: 0, pastry: 0, side: 0, main: 0 };
  const LIMIT = { drink: 1, pastry: 1, side: 2, main: 2 };
  const walk = (from: number, set: Entry[], totals: Record<Metric, number>) => {
    if (set.length > 0) consider(set, totals);
    if (set.length === MAX_COMBO) return;
    for (let index = from; index < pool.length; index++) {
      const entry = pool[index];
      const slot = kind(entry.item);
      if (count[slot] >= LIMIT[slot] || (slot === "drink" && orderHasDrink)) continue;
      const next = { ...totals };
      for (const metric of Object.keys(next) as Metric[]) next[metric] += entry.add[metric];
      if (hard.some((goal) => next[goal.metric] > goal.value)) continue;
      count[slot]++;
      set.push(entry);
      walk(index + 1, set, next);
      set.pop();
      count[slot]--;
    }
  };
  if (!alreadyMet) walk(0, [], baseTotals);

  const found = best as { set: Entry[]; totals: Record<Metric, number>; score: number } | null;
  const totals = found?.totals ?? baseTotals;
  const withOrder = base.lines.length > 0;
  const shownMetrics: Metric[] = ["protein", "kcal", ...(["carbs", "fat"] as const).filter((metric) => goals.goals.some((goal) => goal.metric === metric)), "price"];
  const goalText = (goal: Goal) => `${goal.op === "min" ? "at least" : goal.op === "max" ? "max" : "about"} ${UNIT[goal.metric](goal.value)}`;
  const stats = shownMetrics.map((metric) => {
    const goal = goals.goals.find((entry) => entry.metric === metric);
    const value = Math.round(totals[metric] * 100) / 100;
    return { label: LABEL[metric], value: UNIT[metric](value), ...(goal ? { goal: goalText(goal), met: isMet(goal, value) } : {}) };
  });
  const met = Boolean(found) && goals.goals.every((goal) => isMet(goal, totals[goal.metric]));
  const items = (found?.set ?? []).map(({ item, line }) => ({ id: item.id, name: item.name, image: line.image, description: item.description, price: line.unitPrice, kcal: line.nutrition.kcal, protein: line.nutrition.protein }));

  // The headline number is the first thing the guest asked to reach, or protein when they only set ceilings.
  const lead = soft[0]?.metric ?? goals.most ?? goals.goals[0].metric;
  const others = (["protein", "kcal", "price"] as Metric[]).filter((metric) => metric !== lead && (metric !== "price" || goals.goals.some((goal) => goal.metric === "price")));
  const sums = [lead, ...others.slice(0, 2)].map((metric) => SPOKEN[metric](Math.round(totals[metric] * 100) / 100));
  const names = list(items.map((item) => `the ${spoken(item.name)}`));
  const of = (metric: Metric) => `${UNIT[metric](Math.round(totals[metric] * 100) / 100)}${metric === "protein" || metric === "carbs" || metric === "fat" ? ` of ${LABEL[metric].toLowerCase()}` : ""}`;
  let caption: string;
  let say: string;
  if (alreadyMet) {
    caption = `Your order already gets you there: ${of(lead)}.`;
    say = `Your order already gets you there, with ${SPOKEN[lead](totals[lead])}.`;
  } else if (items.length === 0) {
    caption = "Sorry, nothing on the menu adds up to that.";
    say = caption;
  } else {
    const together = withOrder ? "With your order, that" : "Together that";
    caption = met ? `${together} comes to ${of(lead)}.` : "This is the closest the menu gets.";
    say = `${met ? "How about" : "The closest I can get is"} ${names}${met ? "?" : "."} ${withOrder ? "With your order that's" : "That's"} ${list(sums)}. Shall I add ${items.length === 1 ? "it" : "them"}?`;
  }
  return { caption, items, combo: { ask: input.ask, stats, met: met || alreadyMet, withOrder, say } };
}

/** A dish is left out when the guest's diet rules it out this clearly. */
const MIN_FIT = 0.5;
const tagged = (item: MenuItem, ...tags: string[]) => tags.some((tag) => item.tags.includes(tag));
const DIETS: { said: RegExp; allows: (item: MenuItem) => boolean }[] = [
  { said: /\bvegan\b|plant[\s-]based/, allows: (item) => tagged(item, "vegan") },
  { said: /\bvegetarian\b|\bveggie\b|meat[\s-]free|\bno meat\b|n[o']t eat meat/, allows: (item) => item.category === "drink" || tagged(item, "vegetarian", "vegan") },
  { said: /gluten|coeliac|celiac/, allows: (item) => item.category === "drink" || tagged(item, "gluten-free") },
];

/**
 * One extra Jev call on turns that state a goal: which dishes the guest's stated restrictions allow.
 * The model only sorts dishes; `curate` does the sums.
 */
export async function curateMenu(input: { menu: Menu; ask: string; goals: Goals; order: Order; named?: string[]; apiKey: string; signal?: AbortSignal }): Promise<Suggestion> {
  const { menu } = input;
  const questions: Record<string, Question> = {
    restricted: {
      type: "noul",
      instructions:
        "A coffee shop guest asked the waiter to put together a meal. Apart from numbers (grams, calories, price), did the guest state a restriction on the kind of food: " +
        "a diet (vegetarian, vegan, gluten-free, pescatarian), something to avoid (no dairy, no meat, no pork, no eggs, no coffee, no sugar), a dislike, or wanting only certain kinds of dish (only drinks, no pastries)?",
    },
  };
  for (const item of menu.items) {
    const about = `${item.name}: ${item.description}. Menu section: ${item.category}. Tags: ${item.tags.join(", ") || "none"}.`;
    questions[`fit_${item.id}`] = {
      type: "noul",
      instructions:
        "A coffee shop guest asked the waiter to put together a meal. Looking only at what the guest said about diets, ingredients or kinds of food to avoid, and ignoring every number and nutrition amount, " +
        `may "${item.name}" be served to this guest? Yes when the guest stated no such restriction or the dish respects it; no when it breaks it. ${about}`,
    };
  }
  const answers = await ask({ state: { guest_said: input.ask }, questions }, input.apiKey, input.signal);
  const restricted = (answers.restricted?.noul ?? 0) >= 0.5;
  const text = input.ask.toLowerCase();
  // The menu's own tags decide the common diets; the model's answer covers everything else ("no pork", "no dairy").
  const diet = DIETS.filter((entry) => entry.said.test(text));
  const allowed =
    restricted || diet.length
      ? new Set(
          menu.items
            .filter((item) => diet.every((entry) => entry.allows(item)) && (!restricted || (answers[`fit_${item.id}`]?.noul ?? 1) >= MIN_FIT))
            .map((item) => item.id),
        )
      : undefined;
  // Dishes the guest named while asking: the set must hold one of each kind named.
  const groups = new Map<string, string[]>();
  for (const id of input.named ?? []) {
    const item = menu.itemsById.get(id);
    if (item && (!allowed || allowed.has(id))) groups.set(kind(item), [...(groups.get(kind(item)) ?? []), id]);
  }
  return curate({ menu, order: input.order, ask: input.ask, goals: input.goals, allowed, wanted: [...groups.values()] });
}

/** What the waiter confirms after an accepted suggestion: the dish, or every dish of an accepted set. */
export function acceptedNames(shown: Suggestion | null, accepted: number): string | null {
  if (!shown) return null;
  if (shown.combo) return list(shown.items.map((item) => item.name)) || null;
  return shown.items[accepted - 1]?.name ?? null;
}
