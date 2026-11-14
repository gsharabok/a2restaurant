import { menus, type Menu, type MenuItem } from "./menu";
import { priceOrder, type OrderLine } from "./order";

/**
 * The owner's dashboard. The app stores no orders, so every figure here is sample data: orders are
 * drawn from the real menu with a seeded generator and priced by the same code as the guest screen,
 * so the page is identical on every load.
 */

const OPEN_HOUR = 7;
/** The sample day is frozen at 3pm: earlier hours are "actual", later ones a forecast. */
const NOW_HOUR = 15;
/** Share of the day's orders in each hour from 7am to 6pm: a morning rush and a lunch peak. */
const HOUR_SHAPE = [0.55, 1, 0.95, 0.7, 0.75, 1, 0.95, 0.6, 0.5, 0.45, 0.35, 0.2];
/** Trade on each of the 13 days before the sample day, relative to it. */
const DAY_SHAPE = [0.78, 0.84, 0.86, 0.9, 0.97, 1.02, 0.74, 0.8, 0.87, 0.85, 0.93, 1.01, 1.04];

const PROFILES: Record<string, { ordersPerDay: number; foodRate: number }> = {
  kaffeine: { ordersPerDay: 230, foodRate: 0.72 },
  starbucks: { ordersPerDay: 520, foodRate: 0.48 },
};

export type UnmetKind = "Not on the menu" | "Option not offered" | "Sold out";
type UnmetSeed = { ask: string; kind: UnmetKind; quote: string; closest: string; weekly: number; accepted: number };

/** What guests asked the waiter for that the menu could not give them. `closest` is a real menu item. */
const UNMET: Record<string, UnmetSeed[]> = {
  kaffeine: [
    { ask: "Matcha latte", kind: "Not on the menu", quote: "Do you do a matcha latte?", closest: "latte", weekly: 23, accepted: 0.48 },
    { ask: "Iced flat white", kind: "Option not offered", quote: "Can I get the flat white iced?", closest: "flat_white", weekly: 17, accepted: 0.71 },
    { ask: "Almond Croissant", kind: "Sold out", quote: "And an almond croissant, please", closest: "croissant", weekly: 14, accepted: 0.57 },
    { ask: "Vanilla syrup", kind: "Option not offered", quote: "A latte with a shot of vanilla", closest: "latte", weekly: 11, accepted: 0.82 },
    { ask: "Gluten-free toast", kind: "Not on the menu", quote: "Is there any gluten-free bread?", closest: "sourdough_toast", weekly: 9, accepted: 0.22 },
    { ask: "Soya milk", kind: "Option not offered", quote: "A soya cappuccino", closest: "cappuccino", weekly: 7, accepted: 0.86 },
    { ask: "Chai latte", kind: "Not on the menu", quote: "Have you got chai?", closest: "tea", weekly: 6, accepted: 0.5 },
  ],
  starbucks: [
    { ask: "Pumpkin Spice Latte", kind: "Not on the menu", quote: "A grande pumpkin spice latte", closest: "gingerbread_latte", weekly: 46, accepted: 0.63 },
    { ask: "Iced matcha latte", kind: "Option not offered", quote: "Can I get the matcha iced?", closest: "matcha_latte", weekly: 37, accepted: 0.54 },
    { ask: "Frappuccino", kind: "Not on the menu", quote: "A caramel frappuccino, please", closest: "caramel_macchiato", weekly: 31, accepted: 0.45 },
    { ask: "Festive Feast Toastie", kind: "Sold out", quote: "And the festive toastie", closest: "ham_cheese_toastie", weekly: 24, accepted: 0.58 },
    { ask: "Sugar-free vanilla syrup", kind: "Option not offered", quote: "With sugar-free vanilla", closest: "latte", weekly: 19, accepted: 0.84 },
    { ask: "Gluten-free sandwich", kind: "Not on the menu", quote: "Anything gluten-free for lunch?", closest: "egg_bites", weekly: 15, accepted: 0.33 },
    { ask: "Lactose-free milk", kind: "Option not offered", quote: "Do you have lactose-free milk?", closest: "latte", weekly: 11, accepted: 0.73 },
  ],
};

export const CATEGORY_LABELS: Record<string, string> = {
  drink: "Drinks",
  brunch: "Brunch",
  breakfast: "Breakfast",
  lunch: "Lunch",
  pastry: "Pastries",
  side: "Sides",
};

export type SampleOrder = { number: number; time: string; summary: string; items: number; total: number; images: string[]; offerAccepted: boolean };
export type HourPoint = { label: string; revenue: number; orders: number; lastWeek: number; forecast: boolean };
export type TopSeller = { id: string; name: string; image: string; category: string; qty: number; revenue: number };
export type UnmetRequest = {
  ask: string;
  kind: UnmetKind;
  quote: string;
  closest: { name: string; image: string };
  /** Requests on each of the last seven days, ending with the sample day. */
  daily: number[];
  weekly: number;
  today: number;
  /** Share of those guests who took the closest item instead. */
  accepted: number;
  missed: number;
};
export type Dashboard = {
  id: string;
  name: string;
  tagline: string;
  priceNote: string;
  asOf: string;
  revenue: number;
  orders: number;
  itemsSold: number;
  average: number;
  /** Change against the same hours a week earlier, as a fraction. */
  change: { revenue: number; orders: number; average: number };
  forecastRevenue: number;
  peak: string;
  offer: { made: number; accepted: number; revenue: number };
  hours: HourPoint[];
  days: number[];
  topSellers: TopSeller[];
  categories: { label: string; revenue: number; share: number }[];
  choices: { title: string; rows: { label: string; share: number }[] }[];
  recent: SampleOrder[];
  unmet: { requests: UnmetRequest[]; weekly: number; today: number; missed: number; orderShare: number };
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32: a small seeded generator, so the sample never changes between loads. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How much a category sells at a given hour, from 0 to 1. */
function categoryDemand(category: string, hour: number): number {
  switch (category) {
    case "breakfast":
      return hour <= 10 ? 1 : hour === 11 ? 0.4 : 0.08;
    case "brunch":
      return hour >= 9 && hour <= 14 ? 1 : 0.12;
    case "lunch":
      return hour >= 12 && hour <= 14 ? 1 : hour === 11 || hour === 15 ? 0.5 : 0.04;
    case "pastry":
      return hour <= 10 ? 0.8 : 0.5;
    default:
      return 1;
  }
}

/** Chance that a guest changes an option from its default. */
const CUSTOMISE: Record<string, number> = { milk: 0.4, temp: 0.16, size: 0.38, shots: 0.14, portion: 0.25 };

/** The coffees every café sells most of. */
const STAPLES = new Set(["latte", "flat_white", "cappuccino", "americano"]);

const hourLabel = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;
const round2 = (value: number) => Math.round(value * 100) / 100;

function build(id: string, menu: Menu): Dashboard {
  const random = seeded(hash(id));
  const profile = PROFILES[id] ?? { ordersPerDay: 250, foodRate: 0.6 };
  const appeal = new Map(
    menu.items.map((item) => [item.id, (item.tags.includes("popular") ? 2.2 : 1) * (STAPLES.has(item.id) ? 2 : 1) * (0.55 + random() * 0.9)]),
  );

  const pick = (items: MenuItem[], hour: number): MenuItem | undefined => {
    const weights = items.map((item) => appeal.get(item.id)! * categoryDemand(item.category, hour));
    let at = random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < items.length; i++) if ((at -= weights[i]) <= 0) return items[i];
    return items.at(-1);
  };
  const drinks = menu.items.filter((item) => item.category === "drink");
  const sides = menu.items.filter((item) => item.category === "side");
  const food = menu.items.filter((item) => item.category !== "drink" && item.category !== "side");

  const optionsFor = (item: MenuItem): Record<string, string> => {
    const options: Record<string, string> = {};
    for (const group of item.options ?? []) {
      const { default: standard, values } = menu.optionGroups[group];
      options[group] = standard;
      if (random() >= (CUSTOMISE[group] ?? 0.2)) continue;
      const others = values.filter((value) => value.id !== standard);
      // Oat is by far the most common swap.
      const pool = others.flatMap((value) => (value.id === "oat" ? [value, value, value, value] : [value]));
      if (pool.length) options[group] = pool[Math.floor(random() * pool.length)].id;
    }
    return options;
  };

  const shapeTotal = HOUR_SHAPE.reduce((sum, share) => sum + share, 0);
  const sold = new Map<string, { qty: number; revenue: number }>();
  const byCategory = new Map<string, number>();
  const chosen = new Map<string, Map<string, number>>();
  const orders: (SampleOrder & { hour: number })[] = [];
  const hours: HourPoint[] = [];

  HOUR_SHAPE.forEach((share, index) => {
    const hour = OPEN_HOUR + index;
    const forecast = hour >= NOW_HOUR;
    const count = Math.round(((profile.ordersPerDay * share) / shapeTotal) * (0.92 + random() * 0.16));
    const minutes = Array.from({ length: count }, () => Math.floor(random() * 60)).sort((a, b) => a - b);
    let revenue = 0;
    for (const minute of minutes) {
      const lines = new Map<string, OrderLine>();
      const add = (item: MenuItem | undefined) => {
        if (!item) return;
        const line = lines.get(item.id);
        if (line) line.qty += 1;
        else lines.set(item.id, { itemId: item.id, qty: random() < 0.1 ? 2 : 1, options: optionsFor(item) });
      };
      if (random() < 0.88) add(pick(drinks, hour));
      if (random() < 0.14) add(pick(drinks, hour));
      if (random() < profile.foodRate) {
        const dish = pick(food, hour);
        add(dish);
        if (dish?.category === "brunch" && random() < 0.3) add(pick(sides, hour));
        if (random() < 0.16) add(pick(food, hour));
      }
      if (lines.size === 0) add(pick(drinks, hour));

      const priced = priceOrder(menu, { lines: [...lines.values()] });
      revenue += priced.total;
      if (forecast) continue;
      for (const line of priced.lines) {
        const entry = sold.get(line.itemId) ?? { qty: 0, revenue: 0 };
        sold.set(line.itemId, { qty: entry.qty + line.qty, revenue: entry.revenue + line.lineTotal });
        byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + line.lineTotal);
        for (const option of line.optionRows) {
          const tally = chosen.get(option.group) ?? new Map<string, number>();
          tally.set(option.valueLabel, (tally.get(option.valueLabel) ?? 0) + line.qty);
          chosen.set(option.group, tally);
        }
      }
      orders.push({
        hour,
        number: 1001 + orders.length,
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        summary: priced.lines.map((line) => (line.qty > 1 ? `${line.qty} × ${line.name}` : line.name)).join(", "),
        items: priced.count,
        total: priced.total,
        images: priced.lines.map((line) => line.image),
        offerAccepted: priced.lines.length > 1 && random() < 0.2,
      });
    }
    hours.push({ label: hourLabel(hour), revenue: round2(revenue), orders: count, lastWeek: round2(revenue * (0.8 + random() * 0.3)), forecast });
  });

  const actual = hours.filter((hour) => !hour.forecast);
  const revenue = round2(actual.reduce((sum, hour) => sum + hour.revenue, 0));
  const lastWeekRevenue = actual.reduce((sum, hour) => sum + hour.lastWeek, 0);
  const lastWeekOrders = orders.length * (0.9 + random() * 0.08);
  const average = revenue / orders.length;
  const forecastRevenue = round2(hours.reduce((sum, hour) => sum + hour.revenue, 0));
  const peak = actual.reduce((best, hour) => (hour.revenue > best.revenue ? hour : best));

  const topSellers = [...sold.entries()]
    .map(([itemId, entry]) => {
      const item = menu.itemsById.get(itemId)!;
      return { id: itemId, name: item.name, image: item.image, category: CATEGORY_LABELS[item.category] ?? item.category, qty: entry.qty, revenue: round2(entry.revenue) };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  const categories = [...byCategory.entries()]
    .map(([category, value]) => ({ label: CATEGORY_LABELS[category] ?? category, revenue: round2(value), share: value / revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const choices = ["milk", "temp", "size"]
    .filter((group) => chosen.has(group))
    .map((group) => {
      const tally = [...chosen.get(group)!.entries()].sort((a, b) => b[1] - a[1]);
      const total = tally.reduce((sum, [, qty]) => sum + qty, 0);
      return { title: menu.optionGroups[group].label, rows: tally.slice(0, 4).map(([label, qty]) => ({ label, share: qty / total })) };
    });

  const accepted = orders.filter((order) => order.offerAccepted).length;
  const made = Math.round(orders.length * 0.64);

  const requests = (UNMET[id] ?? []).map((seed): UnmetRequest => {
    const closest = menu.itemsById.get(seed.closest);
    if (!closest) throw new Error(`Unmet request "${seed.ask}" points at "${seed.closest}", which is not on the ${id} menu`);
    // Spread the week's requests over seven days, rising towards the sample day.
    const weights = Array.from({ length: 7 }, (_, day) => 0.6 + day * 0.12 + random() * 0.5);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const daily = weights.map((weight) => Math.round((seed.weekly * weight) / weightTotal));
    const weekly = daily.reduce((sum, count) => sum + count, 0);
    return {
      ask: seed.ask,
      kind: seed.kind,
      quote: seed.quote,
      closest: { name: closest.name, image: closest.image },
      daily,
      weekly,
      today: daily[6],
      accepted: seed.accepted,
      missed: round2(weekly * (1 - seed.accepted) * closest.price),
    };
  });
  requests.sort((a, b) => b.weekly - a.weekly);
  const unmetWeekly = requests.reduce((sum, request) => sum + request.weekly, 0);

  return {
    id,
    name: menu.restaurant.name,
    tagline: menu.restaurant.tagline,
    priceNote: menu.restaurant.priceNote,
    asOf: hourLabel(NOW_HOUR),
    revenue,
    orders: orders.length,
    itemsSold: orders.reduce((sum, order) => sum + order.items, 0),
    average: round2(average),
    change: {
      revenue: revenue / lastWeekRevenue - 1,
      orders: orders.length / lastWeekOrders - 1,
      average: average / (lastWeekRevenue / lastWeekOrders) - 1,
    },
    forecastRevenue,
    peak: peak.label,
    offer: { made, accepted, revenue: round2(accepted * (id === "kaffeine" ? 4.1 : 2.9)) },
    hours,
    days: [...DAY_SHAPE.map((share) => Math.round(forecastRevenue * share * (0.95 + random() * 0.1))), Math.round(forecastRevenue)],
    topSellers,
    categories,
    choices,
    recent: orders.slice(-7).reverse(),
    unmet: {
      requests,
      weekly: unmetWeekly,
      today: requests.reduce((sum, request) => sum + request.today, 0),
      missed: round2(requests.reduce((sum, request) => sum + request.missed, 0)),
      orderShare: unmetWeekly / (profile.ordersPerDay * 7),
    },
  };
}

const dashboards = new Map<string, Dashboard>();

/** `id` must be a key of `menus`. */
export function getDashboard(id: string): Dashboard {
  let dashboard = dashboards.get(id);
  if (!dashboard) dashboards.set(id, (dashboard = build(id, menus[id])));
  return dashboard;
}
