import { Waiter } from "@/components/Waiter";
import { menu } from "@/lib/menu";

export default function Home() {
  const { name, tagline, address, nutritionNote } = menu.restaurant;
  return <Waiter restaurant={{ name, tagline, address, nutritionNote }} />;
}
