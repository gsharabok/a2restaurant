import type { Order, PricedOrder } from "./order";
import type { Suggestion } from "./suggest";

/** What one finished guest turn did, as the order hook reports it. */
export type CommittedTurn = {
  order: Order;
  priced: PricedOrder;
  /** Number of items before the turn. */
  countBefore: number;
  /** Suggestions the guest asked for this turn. */
  suggestion: Suggestion | null;
  /** Name of a suggested dish the guest accepted this turn. */
  acceptedName: string | null;
  /** True when suggestion cards are on screen after the turn. */
  suggestionsShown: boolean;
  nutrition: boolean;
  done: boolean;
};

/** Asked of the interpreter to pick the one thing the waiter offers on top of the order. */
export const UPSELL_QUESTION = "What would you recommend to go with my order?";

const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

const spoken = (name: string) => name.replace(/\s*&\s*/g, " and ").toLowerCase();

const list = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/** Amounts are spelled out so the voice never has to read a currency symbol. */
export function sayPrice(total: number): string {
  const pence = Math.round(total * 100);
  const pounds = Math.floor(pence / 100);
  const rest = pence % 100;
  const poundWord = pounds === 1 ? "pound" : "pounds";
  if (pounds === 0) return `${rest} pence`;
  return rest === 0 ? `${pounds} ${poundWord}` : `${pounds} ${poundWord} ${rest}`;
}

function sayLine(line: PricedOrder["lines"][number]): string {
  const chosen = line.optionRows.filter((row) => !row.isDefault).map((row) => row.valueLabel.toLowerCase());
  const name = [...chosen, spoken(line.name)].join(" ");
  if (line.qty === 1) return /s$/.test(name) ? name : `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
  return `${NUMBERS[line.qty] ?? line.qty} ${/s$/.test(name) ? name : `${name}s`}`;
}

function readBack(priced: PricedOrder): string {
  const items =
    priced.lines.length <= 6
      ? list(priced.lines.map(sayLine))
      : `${NUMBERS[priced.count] ?? priced.count} items`;
  return `Perfect. So that's ${items}. That comes to ${sayPrice(priced.total)}. Coming right up!`;
}

export function saySuggestion(suggestion: Suggestion): string {
  const names = suggestion.items.map((item) => `the ${spoken(item.name)}`);
  if (names.length === 0) return suggestion.caption;
  if (names.length === 1) return `${suggestion.caption} I'd go for ${names[0]}.`;
  return `${suggestion.caption} There's ${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}.`;
}

/**
 * What the waiter says out loud after a guest turn, or null to stay quiet.
 * A plain order gets no reply: the screen already shows it.
 */
export function waiterLine(turn: CommittedTurn): string | null {
  if (turn.done && turn.priced.lines.length > 0) return readBack(turn.priced);
  if (turn.nutrition && turn.priced.lines.length > 0) {
    const { kcal, protein } = turn.priced.nutrition;
    return `All together that's about ${kcal.toLocaleString("en-GB")} calories, with ${protein} grams of protein. The full breakdown is on screen.`;
  }
  const added = turn.acceptedName ? `Lovely, ${spoken(turn.acceptedName)} added.` : null;
  if (turn.suggestion) return [added, saySuggestion(turn.suggestion)].filter(Boolean).join(" ");
  return added;
}

/** A plain order that grew, with nothing else on screen, is the moment for the one offer per order. */
export function mayUpsell(turn: CommittedTurn): boolean {
  return (
    !turn.done &&
    !turn.nutrition &&
    !turn.suggestion &&
    !turn.acceptedName &&
    !turn.suggestionsShown &&
    turn.priced.count > turn.countBefore
  );
}

/** Turns the interpreter's best pairing into a one-dish offer the guest can accept with "yes please". */
export function upsellOffer(pairing: Suggestion | null): Suggestion | null {
  const item = pairing?.items[0];
  if (!item) return null;
  return { caption: `Can I tempt you with the ${spoken(item.name)} to go with that?`, items: [item] };
}
