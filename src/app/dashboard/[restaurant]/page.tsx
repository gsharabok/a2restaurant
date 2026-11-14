import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { getMenu, menus } from "@/lib/menu";

type Props = { params: Promise<{ restaurant: string }> };

export const generateStaticParams = () => Object.keys(menus).map((restaurant) => ({ restaurant }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const menu = getMenu((await params).restaurant);
  return { title: `${menu?.restaurant.name ?? "Restaurant"} · Dashboard`, description: "Sales and missed demand for the restaurant." };
}

async function Screen({ params }: Props) {
  const { restaurant } = await params;
  if (!getMenu(restaurant)) notFound();
  return <Dashboard id={restaurant} />;
}

export default function DashboardPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-slate-50" />}>
      <Screen params={params} />
    </Suspense>
  );
}
