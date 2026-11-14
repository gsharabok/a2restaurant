import { resolveVariant, type Menu, type MenuItem, type Nutrition } from "./menu";

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
  /** For one unit, with the chosen options applied. */
  nutrition: Nutrition;
};
export type PricedOrder = { lines: PricedLine[]; total: number; count: number; nutrition: Nutrition };

export const EMPTY_PRICED: PricedOrder = { lines: [], total: 0, count: 0, nutrition: { kcal: 0, protein: 0, carbs: 0, fat: 0, richIn: [] } };

export const emptyOrder: Order = { lines: [] };

export function defaultOptions(menu: Menu, item: MenuItem): Record<string, string> {
  return Object.fromEntries((item.options ?? []).map((group) => [group, menu.optionGroups[group].default]));
}

/** Drops anything not on the menu and fills missing options with defaults. */
export function sanitizeOrder(menu: Menu, input: unknown): Order {
  const rawLines = (input as Order | undefined)?.lines;
  if (!Array.isArray(rawLines)) return { lines: [] };
  const lines: OrderLine[] = [];
  for (const raw of rawLines) {
    const item = menu.itemsById.get(String(raw?.itemId));
    if (!item || lines.some((line) => line.itemId === item.id)) continue;
    const qty = Math.min(MAX_QTY, Math.max(0, Math.floor(Number(raw?.qty) || 0)));
    if (qty === 0) continue;
    const options = defaultOptions(menu, item);
    for (const group of Object.keys(options)) {
      const wanted = raw?.options?.[group];
      if (menu.optionGroups[group].values.some((value) => value.id === wanted)) options[group] = wanted;
    }
    lines.push({ itemId: item.id, qty, options });
  }
  return { lines };
}

/** Prices come from the menu only; nothing a model returns is trusted for money. */
export function priceOrder(menu: Menu, order: Order): PricedOrder {
  const lines = sanitizeOrder(menu, order).lines.map((line) => {
    const item = menu.itemsById.get(line.itemId)!;
    const { image, nutrition: base } = resolveVariant(item, line.options);
    let unitPrice = item.price;
    let scale = 1;
    const optionRows = Object.entries(line.options).map(([group, value]) => {
      const def = menu.optionGroups[group];
      const chosen = def.values.find((v) => v.id === value)!;
      unitPrice += chosen.price ?? 0;
      scale *= chosen.nutritionScale ?? 1;
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
      image,
      description: item.description,
      category: item.category,
      unitPrice,
      lineTotal: Math.round(unitPrice * line.qty * 100) / 100,
      pricePlaceholder: Boolean(item.pricePlaceholder),
      optionRows,
      nutrition: {
        // A scaled figure is an estimate, so it is rounded to 5; an unscaled one is shown as the menu gives it.
        kcal: scale === 1 ? base.kcal : Math.round((base.kcal * scale) / 5) * 5,
        protein: Math.round(base.protein * scale),
        carbs: Math.round(base.carbs * scale),
        fat: Math.round(base.fat * scale),
        richIn: base.richIn,
      },
    };
  });
  const total = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
  const sum = (pick: (n: Nutrition) => number) => lines.reduce((all, line) => all + pick(line.nutrition) * line.qty, 0);
  // Nutrients named by the most dishes come first.
  const mentions = new Map<string, number>();
  for (const line of lines) for (const name of line.nutrition.richIn) mentions.set(name, (mentions.get(name) ?? 0) + 1);
  const richIn = [...mentions.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 5);
  return {
    lines,
    total,
    count: lines.reduce((all, line) => all + line.qty, 0),
    nutrition: { kcal: sum((n) => n.kcal), protein: sum((n) => n.protein), carbs: sum((n) => n.carbs), fat: sum((n) => n.fat), richIn },
  };
}
