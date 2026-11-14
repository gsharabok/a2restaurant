import data from "@/data/kaffeine.json";

/** `nutritionScale` multiplies the item's estimated nutrition, e.g. a large size or a lighter milk. */
export type OptionValue = { id: string; label: string; heard: string; price?: number; nutritionScale?: number };
/** Per serving: kcal, then grams. All figures are estimates. */
export type Nutrition = { kcal: number; protein: number; carbs: number; fat: number; richIn: string[] };
export type OptionGroup = { label: string; default: string; values: OptionValue[] };
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
};
export type Menu = {
  restaurant: {
    id: string;
    name: string;
    address: string;
    tagline: string;
    currency: string;
    menuSource: string;
    menuDate: string;
    priceNote: string;
    nutritionNote: string;
  };
  optionGroups: Record<string, OptionGroup>;
  items: MenuItem[];
};

export const menu = data as Menu;
export const itemsById = new Map(menu.items.map((item) => [item.id, item]));
