import type { Menu } from "./menu";
import { defaultOptions, sanitizeOrder, type Order, type OrderLine } from "./order";

const API_URL = "https://api.typesafe.ai/v1/systemone";
const QTY_WORDS = ["none", "one", "two", "three", "four"] as const;
const UNSPECIFIED = "unspecified";
/** Below this, an answer that would change the order is ignored and the previous value is kept. */
const MIN_CONFIDENCE = 0.6;
/** Putting a new item on the order needs more certainty than editing one, so look-alike dishes don't appear uninvited. */
const MIN_CONFIDENCE_TO_ADD = 0.78;

export const SUGGESTION_TOPICS = ["healthy", "protein", "popular", "vegetarian", "vegan", "sweet", "breakfast", "lunch", "drinks", "other", "unavailable"] as const;
export type SuggestionTopic = (typeof SUGGESTION_TOPICS)[number];
/** Dishes that answer a question such as "anything with eggs?", best match first. */
export type SuggestionPick = {
  topic: SuggestionTopic;
  itemIds: string[];
  /** False when nothing answered the question well and these are only the nearest dishes, or when it is unclear the menu lacks what they asked for. */
  exact: boolean;
};
/** A dish must match the guest's question at least this well to be suggested. */
const MIN_MATCH = 0.5;
/** When nothing matches that well, the nearest dishes are shown instead of nothing, down to this score. */
const MIN_NEAR = 0.2;
const MIN_ASKING = 0.6;
const MIN_UNAVAILABLE = 0.7;
/** Between the two, the waiter is unsure the menu lacks it and says so. */
const MIN_MAYBE_UNAVAILABLE = 0.5;

export type Interpretation = {
  order: Order;
  /** Set when the guest is asking what there is or for a recommendation, rather than ordering. */
  suggest: SuggestionPick | null;
  /** 1-based index of a shown suggestion the guest accepted ("add the first one"). */
  accepted: number | null;
  /** The guest asked about the nutrition of what they are ordering. */
  nutrition: boolean;
  done: boolean;
  /** The guest asked to pay for the order. */
  pay: boolean;
  ms: number;
  /** Confidence of every quantity answer that put an item in the order, for tuning. */
  confidences: Record<string, number>;
};

type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string };
type Answer = { type: string; choice?: string; confidence?: number | null; noul?: number };

const describeLine = (menu: Menu, line: OrderLine) => {
  const item = menu.itemsById.get(line.itemId)!;
  const options = Object.entries(line.options)
    .map(([group, value]) => `${menu.optionGroups[group].label.toLowerCase()}: ${value}`)
    .join(", ");
  return `${line.qty} x ${item.name}${options ? ` (${options})` : ""}`;
};

function buildQuestions(menu: Menu, before: Order, shownSuggestions: string[]): Record<string, Question> {
  const questions: Record<string, Question> = {};
  const beforeById = new Map(before.lines.map((line) => [line.itemId, line]));

  for (const item of menu.items) {
    const had = beforeById.get(item.id);
    const context = had
      ? `Before this turn the order already had ${QTY_WORDS[had.qty]} of it.`
      : "Before this turn it was not in the order.";
    questions[`qty_${item.id}`] = {
      type: "choice",
      instructions:
        `A guest is ordering out loud at a coffee shop. \`guest_said_this_turn\` is a live transcript and may stop mid-sentence. ` +
        `Menu item "${item.name}": ${item.heard} ${context} ` +
        `Counting what was there before and every addition, change, swap or removal the guest has said this turn, how many of this item should the order have now?`,
      criteria: {
        none: had
          ? "The guest removed it, cancelled it, or swapped it for something else."
          : "The guest has not asked for this item.",
        one: "Exactly one.",
        two: "Exactly two.",
        three: "Exactly three.",
        four: "Four or more.",
      },
    };

    for (const group of item.options ?? []) {
      const def = menu.optionGroups[group];
      const criteria: Record<string, string> = Object.fromEntries(
        def.values.map((value) => [value.id, `The guest asked for ${value.heard}.`]),
      );
      criteria[UNSPECIFIED] = `The guest has not said anything this turn about the ${def.label.toLowerCase()} of the ${item.name}.`;
      questions[`opt_${item.id}_${group}`] = {
        type: "choice",
        instructions: `A guest is ordering out loud at a coffee shop. For the ${item.name}, which ${def.label.toLowerCase()} has the guest asked for this turn?`,
        criteria,
      };
    }
  }

  questions.asking = {
    type: "noul",
    instructions:
      "Is the guest asking the waiter a question about the menu or asking for a suggestion, rather than only stating what they want? " +
      "Examples: \"what do you have for breakfast\", \"do you have anything with eggs\", \"what's popular\", \"I want something healthy\", \"what do you recommend\", \"any vegan options\", \"what's high in protein\". " +
      "Asking only for the nutrition of what is already ordered does not count.",
  };
  questions.unavailable = {
    type: "noul",
    instructions:
      "Has the guest asked to have, or asked whether you sell, a specific food or drink that this coffee shop's menu does not have? " +
      `The whole menu is: ${menu.items.map((item) => item.name).join("; ")}. ` +
      "A shorter or looser name for something on the menu counts as on the menu, for example \"a croissant\", \"a coffee\", \"a tea\" or \"a toastie\". " +
      "Changing how a menu item is made (size, milk, iced, extra shot) does not count, and neither does a general question such as \"what's healthy\". " +
      "Examples that do count on a menu without them: \"a slice of pizza\", \"do you have sushi\", \"a pint of lager\".",
  };
  questions.wanting = {
    type: "noul",
    instructions:
      "Has the guest named a food or drink they want to have or add, such as \"a green tea\", \"a sandwich\" or \"some water\"? " +
      "The transcript may stop mid-sentence: if the name of the thing has not been said yet or is cut off, the answer is no. " +
      "Greetings, thanks, questions, paying, finishing, and removing or changing something already ordered do not count.",
  };
  questions.nutrition = {
    type: "noul",
    instructions:
      "Is the guest asking to see nutrition details for what they have ordered or are ordering? " +
      "Examples: \"how many calories is that\", \"show me the nutrition\", \"how much protein is in my order\", \"what about carbs and fat\", \"what vitamins does that have\", \"show me the macros\". " +
      "Asking for a different dish, such as \"something high in protein\" or \"something healthy\", does not count.",
  };
  questions.done = {
    type: "noul",
    instructions:
      "Has the guest clearly said they are finished ordering, for example \"that's it\", \"that's all\" or \"that's everything\"?",
  };
  questions.pay = {
    type: "noul",
    instructions:
      "Has the guest said they want to pay for their order now? " +
      "Examples: \"I want to pay\", \"I'd like to pay\", \"can I pay\", \"let me pay\", \"check out\", \"the bill please\", \"pay with Link\", \"charge me\". " +
      "Asking what something costs, or only saying they are finished ordering, does not count.",
  };
  if (shownSuggestions.length > 0) {
    const ordinals = ["first", "second", "third"];
    const criteria: Record<string, string> = {
      none: "The guest has not accepted any of the suggestions shown on screen.",
    };
    shownSuggestions.slice(0, 3).forEach((id, index) => {
      criteria[ordinals[index]] = `The guest accepts the ${ordinals[index]} suggestion (${menu.itemsById.get(id)?.name}), for example "add the ${ordinals[index]} one" or by naming it.`;
    });
    questions.accept = {
      type: "choice",
      instructions:
        "`suggestions_on_screen` lists dishes the waiter is suggesting, in order. Has the guest accepted one of them?",
      criteria,
    };
  }
  return questions;
}

async function ask(body: object, apiKey: string, signal?: AbortSignal): Promise<Record<string, Answer>> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.TYPESAFE_MODEL ?? "jev-latest", ...body }),
    signal,
  });
  if (!response.ok) throw new Error(`TypeSafe ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return ((await response.json()) as { answers: Record<string, Answer> }).answers;
}

/**
 * Scores every dish against the guest's question and returns the best three not already ordered.
 * With `unavailable`, the guest asked for something the menu lacks and the dishes are scored as stand-ins for it.
 */
async function pickSuggestions(input: { menu: Menu; said: string; order: Order; unavailable: boolean; apiKey: string; signal?: AbortSignal }): Promise<SuggestionPick> {
  const { menu } = input;
  const ordered = new Set(input.order.lines.map((line) => line.itemId));
  const candidates = menu.items.filter((item) => !ordered.has(item.id));
  const questions: Record<string, Question> = {
    topic: {
      type: "choice",
      instructions: "A coffee shop guest asked the waiter a question or for a suggestion. What are they asking for?",
      criteria: {
        healthy: "Something healthy, light, fresh or low-calorie.",
        protein: "Something high in protein or filling after exercise.",
        popular: "What is popular, the best, a favourite, or a general recommendation with no specific kind of food named.",
        vegan: "Vegan or dairy-free and egg-free food.",
        vegetarian: "Vegetarian or meat-free food.",
        sweet: "Something sweet, a pastry, a treat or a dessert.",
        breakfast: "What there is for breakfast or brunch in general.",
        lunch: "What there is for lunch in general.",
        drinks: "What drinks, coffees or teas there are.",
        other: "A specific ingredient, dish or anything else, for example dishes with eggs, with salmon, or something savoury.",
      },
    },
  };
  for (const item of candidates) {
    questions[`match_${item.id}`] = {
      type: "noul",
      instructions:
        (input.unavailable
          ? `A coffee shop guest asked for something that is not on the menu. Find what they asked for in \`guest_said\`. Everything in \`guest_already_ordered\` was understood and is not the missing thing: ignore those parts of what they said. ` +
            `Is "${item.name}" a close stand-in for the missing thing: the same kind of food or drink, with a similar flavour or main ingredient, that they would likely take instead? `
          : `A coffee shop guest asked the waiter a question or for a suggestion. \`guest_already_ordered\` is what they have so far. ` +
            `Would "${item.name}" be a good dish to show them in answer? If they ask what goes with something they already have, ` +
            `a good answer complements it (food with a drink, a drink with food) and is not another item of the same kind. `) +
        `${item.name}: ${item.description}. Menu section: ${item.category}. Tags: ${item.tags.join(", ") || "none"}. ` +
        `Per serving about ${item.nutrition.kcal} kcal, ${item.nutrition.protein} g protein, ${item.nutrition.carbs} g carbs, ${item.nutrition.fat} g fat.`,
    };
  }
  const state = {
    guest_already_ordered: input.order.lines.length ? input.order.lines.map((line) => describeLine(menu, line)) : "nothing yet",
    guest_said: input.said,
  };
  const answers = await ask({ state, questions }, input.apiKey, input.signal);
  const topic = input.unavailable
    ? "unavailable"
    : (SUGGESTION_TOPICS as readonly string[]).includes(answers.topic?.choice ?? "")
      ? (answers.topic!.choice as SuggestionTopic)
      : "other";
  const score = (id: string) => answers[`match_${id}`]?.noul ?? 0;
  // A question about a number is ranked by the menu's numbers, among the dishes that fit the rest of the request.
  if (topic === "protein") {
    const fitting = candidates.filter((item) => score(item.id) >= MIN_MATCH);
    const byProtein = fitting.sort((a, b) => b.nutrition.protein - a.nutrition.protein);
    if (fitting.length) return { topic, itemIds: byProtein.slice(0, 3).map((item) => item.id), exact: true };
  }
  const best = (min: number) =>
    candidates
      .filter((item) => score(item.id) >= min)
      .sort((a, b) => score(b.id) - score(a.id))
      .slice(0, 3)
      .map((item) => item.id);
  const itemIds = best(MIN_MATCH);
  if (itemIds.length || input.unavailable) return { topic, itemIds: itemIds.length ? itemIds : best(MIN_NEAR), exact: true };
  return { topic, itemIds: best(MIN_NEAR), exact: false };
}

export async function interpret(input: {
  menu: Menu;
  before: Order;
  said: string;
  shownSuggestions?: string[];
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Interpretation> {
  const { menu } = input;
  const before = sanitizeOrder(menu, input.before);
  const shown = (input.shownSuggestions ?? []).filter((id) => menu.itemsById.has(id));
  const said = input.said.trim();
  if (!said) return { order: before, suggest: null, accepted: null, nutrition: false, done: false, pay: false, ms: 0, confidences: {} };

  const started = performance.now();
  const answers = await ask(
    {
      state: {
        order_before_this_turn: before.lines.length ? before.lines.map((line) => describeLine(menu, line)) : "empty",
        ...(shown.length ? { suggestions_on_screen: shown.map((id) => menu.itemsById.get(id)!.name) } : {}),
        guest_said_this_turn: said,
      },
      questions: buildQuestions(menu, before, shown),
    },
    input.apiKey,
    input.signal,
  );

  const sure = (answer: Answer | undefined) => (answer?.confidence ?? 1) >= MIN_CONFIDENCE;
  const beforeById = new Map(before.lines.map((line) => [line.itemId, line]));
  const lines: OrderLine[] = [];
  const confidences: Record<string, number> = {};

  const ordinal = ["first", "second", "third"].indexOf(answers.accept?.choice ?? "");
  const acceptedId = ordinal >= 0 && sure(answers.accept) ? shown[ordinal] : undefined;

  for (const item of menu.items) {
    const had = beforeById.get(item.id);
    const answer = answers[`qty_${item.id}`];
    let qty = had?.qty ?? 0;
    if (answer?.choice && sure(answer)) {
      const heard = QTY_WORDS.indexOf(answer.choice as (typeof QTY_WORDS)[number]);
      if (had || heard === 0 || (answer.confidence ?? 1) >= MIN_CONFIDENCE_TO_ADD) qty = heard;
    }
    if (item.id === acceptedId && qty === 0) qty = 1;
    if (qty <= 0) continue;
    confidences[item.id] = answer?.confidence ?? 1;

    const options = { ...defaultOptions(menu, item), ...(had?.options ?? {}) };
    for (const group of item.options ?? []) {
      const chosen = answers[`opt_${item.id}_${group}`];
      if (chosen?.choice && chosen.choice !== UNSPECIFIED && sure(chosen)) options[group] = chosen.choice;
    }
    lines.push({ itemId: item.id, qty, options });
  }

  // Keep the order the guest built it in: existing lines first, new ones after.
  const position = (line: OrderLine) => {
    const index = before.lines.findIndex((existing) => existing.itemId === line.itemId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  lines.sort((a, b) => position(a) - position(b));

  const order = sanitizeOrder(menu, { lines });
  const nutrition = (answers.nutrition?.noul ?? 0) >= MIN_ASKING && order.lines.length > 0;
  // Asking for something the menu lacks is answered with the nearest dishes, so the guest is never left with a silent screen.
  // A request that changed nothing would leave the guest with a silent screen, so it is answered with the nearest dishes,
  // as is asking for something the menu lacks.
  const asking = (answers.asking?.noul ?? 0) >= MIN_ASKING;
  const done = (answers.done?.noul ?? 0) > 0.7;
  const unchanged = JSON.stringify(order) === JSON.stringify(before);
  const missed = unchanged && !asking && !done && (answers.wanting?.noul ?? 0) >= MIN_ASKING;
  const lackingScore = answers.unavailable?.noul ?? 0;
  const lacking = lackingScore >= MIN_UNAVAILABLE;
  const unavailable = lackingScore >= MIN_MAYBE_UNAVAILABLE || missed;
  const suggest =
    !nutrition && (unavailable || asking)
      ? { ...(await pickSuggestions({ menu, said, order, unavailable, apiKey: input.apiKey, signal: input.signal })), ...(unavailable ? { exact: lacking } : {}) }
      : null;

  return {
    order,
    suggest,
    accepted: acceptedId ? ordinal + 1 : null,
    nutrition,
    done,
    pay: (answers.pay?.noul ?? 0) > 0.7 && order.lines.length > 0,
    ms: Math.round(performance.now() - started),
    confidences,
  };
}
