import kaffeine from "@/data/kaffeine.json";
import starbucks from "@/data/starbucks.json";

/** `nutritionScale` multiplies the item's nutrition, e.g. a large size or a lighter milk. */
export type OptionValue = { id: string; label: string; heard: string; price?: number; nutritionScale?: number };
/** Per serving: kcal, then grams. */
export type Nutrition = { kcal: number; protein: number; carbs: number; fat: number; richIn: string[] };
export type OptionGroup = { label: string; default: string; values: OptionValue[] };
/** Replaces the item's photo or nutrition when every option in `when` is chosen, e.g. the iced venti. */
export type Variant = { when: Record<string, string>; image?: string; nutrition?: Nutrition };
export type Temperature = "hot" | "cold";
export type DrinkArtKind = "black" | "milky" | "foamy" | "chocolate";
export type MenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  pricePlaceholder?: boolean;
  image: string;
  description: string;
  heard: string;
  tags: string[];
  options?: string[];
  nutrition: Nutrition;
  variants?: Variant[];
  /** How the item arrives when it has no hot/iced option: decides whether it steams or carries ice. */
  serve?: Temperature;
  /** Draws the drink as a live cup or glass instead of showing `image`. */
  art?: DrinkArtKind;
};
export type Restaurant = {
  id: string;
  name: string;
  address: string;
  tagline: string;
  currency: string;
  menuSource: string;
  menuDate: string;
  priceNote: string;
  nutritionNote: string;
  /** Example phrases shown on the empty screen. */
  hints: string[];
  /** The rehearsed order "Play demo" types at speaking pace. */
  demoTurns: string[];
};
export type Menu = {
  restaurant: Restaurant;
  optionGroups: Record<string, OptionGroup>;
  items: MenuItem[];
  itemsById: Map<string, MenuItem>;
};

const load = (data: unknown): Menu => {
  const menu = data as Omit<Menu, "itemsById">;
  return { ...menu, itemsById: new Map(menu.items.map((item) => [item.id, item])) };
};

export const DEFAULT_RESTAURANT = "kaffeine";
/** Keyed by the id used in the URL. */
export const menus: Record<string, Menu> = { kaffeine: load(kaffeine), starbucks: load(starbucks) };
export const getMenu = (id: unknown): Menu | undefined => (typeof id === "string" && Object.hasOwn(menus, id) ? menus[id] : undefined);

/** The item's photo and nutrition for the chosen options. Later variants win. */
export function resolveVariant(item: MenuItem, options: Record<string, string>): { image: string; nutrition: Nutrition } {
  let { image, nutrition } = item;
  for (const variant of item.variants ?? []) {
    if (!Object.entries(variant.when).every(([group, value]) => options[group] === value)) continue;
    image = variant.image ?? image;
    nutrition = variant.nutrition ?? nutrition;
  }
  return { image, nutrition };
}
