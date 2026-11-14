import { itemsById, menu, type MenuItem } from "./menu";

export const MAX_QTY = 4;

export type OrderLine = { itemId: string; qty: number; options: Record<string, string> };
export type Order = { lines: OrderLine[] };

export type PricedOption = { group: string; label: string; value: string; valueLabel: string; isDefault: boolean; values: { id: string; label: string }[] };
export type PricedLine = OrderLine & {
  name: string;
  image: string;
  description: string;
  category: string;
  unitPrice: number;
  lineTotal: number;
  pricePlaceholder: boolean;
  optionRows: PricedOption[];
};
export type PricedOrder = { lines: PricedLine[]; total: number; count: number };

export const emptyOrder: Order = { lines: [] };

export function defaultOptions(item: MenuItem): Record<string, string> {
  return Object.fromEntries((item.options ?? []).map((group) => [group, menu.optionGroups[group].default]));
}

/** Drops anything not on the menu and fills missing options with defaults. */
export function sanitizeOrder(input: unknown): Order {
  const rawLines = (input as Order | undefined)?.lines;
  if (!Array.isArray(rawLines)) return { lines: [] };
  const lines: OrderLine[] = [];
  for (const raw of rawLines) {
    const item = itemsById.get(String(raw?.itemId));
    if (!item || lines.some((line) => line.itemId === item.id)) continue;
    const qty = Math.min(MAX_QTY, Math.max(0, Math.floor(Number(raw?.qty) || 0)));
    if (qty === 0) continue;
    const options = defaultOptions(item);
    for (const group of Object.keys(options)) {
      const wanted = raw?.options?.[group];
      if (menu.optionGroups[group].values.some((value) => value.id === wanted)) options[group] = wanted;
    }
    lines.push({ itemId: item.id, qty, options });
  }
  return { lines };
}

/** Prices come from the menu only; nothing a model returns is trusted for money. */
export function priceOrder(order: Order): PricedOrder {
  const lines = sanitizeOrder(order).lines.map((line) => {
    const item = itemsById.get(line.itemId)!;
    let unitPrice = item.price;
    const optionRows = Object.entries(line.options).map(([group, value]) => {
      const def = menu.optionGroups[group];
      const chosen = def.values.find((v) => v.id === value)!;
      unitPrice += chosen.price ?? 0;
      return {
        group,
        label: def.label,
        value,
        valueLabel: chosen.label,
        isDefault: value === def.default,
        values: def.values.map((v) => ({ id: v.id, label: v.label })),
      };
    });
    unitPrice = Math.round(unitPrice * 100) / 100;
    return {
      ...line,
      name: item.name,
      image: item.image,
      description: item.description,
      category: item.category,
      unitPrice,
      lineTotal: Math.round(unitPrice * line.qty * 100) / 100,
      pricePlaceholder: Boolean(item.pricePlaceholder),
      optionRows,
    };
  });
  const total = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
  return { lines, total, count: lines.reduce((sum, line) => sum + line.qty, 0) };
}
