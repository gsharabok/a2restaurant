import { itemsById, menu } from "./menu";
import { defaultOptions, sanitizeOrder, type Order, type OrderLine } from "./order";

const API_URL = "https://api.typesafe.ai/v1/systemone";
const QTY_WORDS = ["none", "one", "two", "three", "four"] as const;
const UNSPECIFIED = "unspecified";
/** Below this, an answer that would change the order is ignored and the previous value is kept. */
const MIN_CONFIDENCE = 0.6;
/** Putting a new item on the order needs more certainty than editing one, so look-alike dishes don't appear uninvited. */
const MIN_CONFIDENCE_TO_ADD = 0.78;

export const SUGGESTION_KINDS = ["healthy", "popular", "vegetarian", "sweet"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export type Interpretation = {
  order: Order;
  /** Set when the guest is asking for a recommendation rather than ordering. */
  suggest: SuggestionKind | null;
  /** 1-based index of a shown suggestion the guest accepted ("add the first one"). */
  accepted: number | null;
  done: boolean;
  ms: number;
  /** Confidence of every quantity answer that put an item in the order, for tuning. */
  confidences: Record<string, number>;
};

type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string };
type Answer = { type: string; choice?: string; confidence?: number | null; noul?: number };

const describeLine = (line: OrderLine) => {
  const item = itemsById.get(line.itemId)!;
  const options = Object.entries(line.options)
    .map(([group, value]) => `${menu.optionGroups[group].label.toLowerCase()}: ${value}`)
    .join(", ");
  return `${line.qty} x ${item.name}${options ? ` (${options})` : ""}`;
};

function buildQuestions(before: Order, shownSuggestions: string[]): Record<string, Question> {
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
        `A guest is ordering out loud at a cafe. \`guest_said_this_turn\` is a live transcript and may stop mid-sentence. ` +
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
        instructions: `A guest is ordering out loud at a cafe. For the ${item.name}, which ${def.label.toLowerCase()} has the guest asked for this turn?`,
        criteria,
      };
    }
  }

  questions.suggest = {
    type: "choice",
    instructions:
      "Is the guest asking the waiter to recommend or suggest something, rather than naming what they want?",
    criteria: {
      none: "The guest is ordering, changing the order, or has not asked for a recommendation.",
      healthy: "The guest asks for something healthy, light, fresh or low-calorie.",
      popular: "The guest asks what is popular, the best, the favourite, or what the waiter recommends in general.",
      vegetarian: "The guest asks for vegetarian, vegan or meat-free suggestions.",
      sweet: "The guest asks for something sweet, a pastry, a treat or a dessert.",
    },
  };
  questions.done = {
    type: "noul",
    instructions:
      "Has the guest clearly said they are finished ordering, for example \"that's it\", \"that's all\" or \"that's everything\"?",
  };
  if (shownSuggestions.length > 0) {
    const ordinals = ["first", "second", "third"];
    const criteria: Record<string, string> = {
      none: "The guest has not accepted any of the suggestions shown on screen.",
    };
    shownSuggestions.slice(0, 3).forEach((id, index) => {
      criteria[ordinals[index]] = `The guest accepts the ${ordinals[index]} suggestion (${itemsById.get(id)?.name}), for example "add the ${ordinals[index]} one" or by naming it.`;
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

export async function interpret(input: {
  before: Order;
  said: string;
  shownSuggestions?: string[];
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Interpretation> {
  const before = sanitizeOrder(input.before);
  const shown = (input.shownSuggestions ?? []).filter((id) => itemsById.has(id));
  const said = input.said.trim();
  if (!said) return { order: before, suggest: null, accepted: null, done: false, ms: 0, confidences: {} };

  const started = performance.now();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({
      model: process.env.TYPESAFE_MODEL ?? "jev-latest",
      state: {
        order_before_this_turn: before.lines.length ? before.lines.map(describeLine) : "empty",
        ...(shown.length ? { suggestions_on_screen: shown.map((id) => itemsById.get(id)!.name) } : {}),
        guest_said_this_turn: said,
      },
      questions: buildQuestions(before, shown),
    }),
    signal: input.signal,
  });
  if (!response.ok) throw new Error(`TypeSafe ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const answers = ((await response.json()) as { answers: Record<string, Answer> }).answers;
  const ms = Math.round(performance.now() - started);

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

    const options = { ...defaultOptions(item), ...(had?.options ?? {}) };
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

  const suggestChoice = answers.suggest?.choice;
  const suggest =
    suggestChoice && suggestChoice !== "none" && sure(answers.suggest) ? (suggestChoice as SuggestionKind) : null;

  return {
    order: sanitizeOrder({ lines }),
    suggest,
    accepted: acceptedId ? ordinal + 1 : null,
    done: (answers.done?.noul ?? 0) > 0.7,
    ms,
    confidences,
  };
}
