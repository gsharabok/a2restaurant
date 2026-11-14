import data from "@/data/kaffeine.json";

export type OptionValue = { id: string; label: string; heard: string; price?: number };
export type OptionGroup = { label: string; default: string; values: OptionValue[] };
export type MenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  pricePlaceholder?: boolean;
  emoji: string;
  description: string;
  heard: string;
  tags: string[];
  options?: string[];
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
  };
  optionGroups: Record<string, OptionGroup>;
  items: MenuItem[];
};

export const menu = data as Menu;
export const itemsById = new Map(menu.items.map((item) => [item.id, item]));
