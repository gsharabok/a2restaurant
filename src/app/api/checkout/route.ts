import { tooMany } from "@/lib/rateLimit";
import { getMenu } from "@/lib/menu";
import { priceOrder, sanitizeOrder } from "@/lib/order";

/**
 * Opens a Stripe-hosted checkout for the order's total, where a returning guest pays in one click with Link.
 * The amount is priced here from the menu, never taken from the browser.
 * Without STRIPE_SECRET_KEY it answers `{ url: null }` and the screen shows its own demo checkout.
 */
export async function POST(request: Request) {
  const limited = tooMany(request, "checkout", 20);
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { restaurant?: unknown; order?: unknown } | null;
  const menu = getMenu(body?.restaurant);
  if (!menu) return Response.json({ error: "Unknown restaurant." }, { status: 400 });
  const priced = priceOrder(menu, sanitizeOrder(menu, body?.order));
  if (priced.total <= 0) return Response.json({ error: "The order is empty." }, { status: 400 });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return Response.json({ url: null, total: priced.total });

  // The page address is the registry key the request named, which getMenu has just checked.
  const back = `${new URL(request.url).origin}/${body!.restaurant as string}`;
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${back}?paid=1`,
    cancel_url: back,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": menu.restaurant.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(Math.round(priced.total * 100)),
    "line_items[0][price_data][product_data][name]": `Your order at ${menu.restaurant.name}`,
    "line_items[0][price_data][product_data][description]": `${priced.count} item${priced.count === 1 ? "" : "s"}`,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
    signal: request.signal,
  });
  const session = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
  if (!response.ok || !session?.url) {
    return Response.json({ error: session?.error?.message ?? "Stripe could not start the checkout." }, { status: 502 });
  }
  return Response.json({ url: session.url, total: priced.total });
}
