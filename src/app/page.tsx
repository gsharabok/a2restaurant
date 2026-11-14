import { RestaurantScreen } from "@/components/RestaurantScreen";
import { DEFAULT_RESTAURANT } from "@/lib/menu";

export default function Home() {
  return <RestaurantScreen id={DEFAULT_RESTAURANT} />;
}
