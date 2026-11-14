import { Waiter } from "./Waiter";
import { menus } from "@/lib/menu";

/** Server-side: hands the screen only what it shows, not the whole menu. */
export function RestaurantScreen({ id }: { id: string }) {
  const { name, tagline, nutritionNote, hints, demoTurns } = menus[id].restaurant;
  const restaurants = Object.entries(menus).map(([key, menu]) => ({ id: key, name: menu.restaurant.name }));
  // The key gives each restaurant a fresh order when the guest switches.
  return <Waiter key={id} restaurant={{ id, name, tagline, nutritionNote, hints, demoTurns }} restaurants={restaurants} />;
}
