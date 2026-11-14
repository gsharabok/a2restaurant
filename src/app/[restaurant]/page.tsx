import { Suspense } from "react";
import { notFound } from "next/navigation";
import { RestaurantScreen } from "@/components/RestaurantScreen";
import { getMenu, menus } from "@/lib/menu";

export const generateStaticParams = () => Object.keys(menus).map((restaurant) => ({ restaurant }));

async function Screen({ params }: { params: Promise<{ restaurant: string }> }) {
  const { restaurant } = await params;
  if (!getMenu(restaurant)) notFound();
  return <RestaurantScreen id={restaurant} />;
}

export default function RestaurantPage({ params }: { params: Promise<{ restaurant: string }> }) {
  return (
    <Suspense fallback={<main className="h-dvh bg-[#0b0a09]" />}>
      <Screen params={params} />
    </Suspense>
  );
}
