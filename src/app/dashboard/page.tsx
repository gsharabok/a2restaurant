import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { DEFAULT_RESTAURANT, menus } from "@/lib/menu";

export const metadata: Metadata = { title: `${menus[DEFAULT_RESTAURANT].restaurant.name} · Dashboard`, description: "Sales and missed demand for the restaurant." };

export default function DashboardHome() {
  return <Dashboard id={DEFAULT_RESTAURANT} />;
}
