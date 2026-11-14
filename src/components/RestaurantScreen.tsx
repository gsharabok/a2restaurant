import { Waiter } from "./Waiter";
import { menus } from "@/lib/menu";
import { ANYWHERE, anywhere } from "@/lib/explore";

/** Server-side: hands the screen only what it shows, not the whole menu. Without an id the guest has yet to choose a restaurant. */
export function RestaurantScreen({ id }: { id?: string }) {
  const { name, tagline, nutritionNote, hints, demoTurns } = id ? menus[id].restaurant : anywhere;
  const restaurants = Object.entries(menus).map(([key, menu]) => ({ id: key, name: menu.restaurant.name }));
  // The key gives each restaurant a fresh order when the guest switches.
  return <Waiter key={id ?? ANYWHERE} restaurant={{ id: id ?? ANYWHERE, name, tagline, nutritionNote, hints, demoTurns }} restaurants={restaurants} choosingPlace={!id} />;
}
