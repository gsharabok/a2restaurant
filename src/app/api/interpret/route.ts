import { tooMany } from "@/lib/rateLimit";
import { getMenu } from "@/lib/menu";
import { interpret } from "@/lib/interpret";
import { EMPTY_PRICED, priceOrder, sanitizeOrder } from "@/lib/order";
import { toSuggestion } from "@/lib/suggest";
import { reviewSheet } from "@/lib/reviews";
import { ANYWHERE, explore } from "@/lib/explore";

export async function POST(request: Request) {
  // Speech re-reads the order on every interim result, a few times a second while the guest talks.
  const limited = tooMany(request, "interpret", 300);
  if (limited) return limited;
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "TYPESAFE_API_KEY is not set. Add it to .env.local and restart." }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as {
    restaurant?: unknown;
    before?: unknown;
    said?: unknown;
    shownSuggestions?: unknown;
    shownCombo?: unknown;
  } | null;
  const restaurantId = String(body?.restaurant ?? "");
  const said = typeof body?.said === "string" ? body.said.slice(0, 2000) : "";
  const shown = Array.isArray(body?.shownSuggestions) ? body.shownSuggestions.map(String).slice(0, 4) : [];
  if (restaurantId === ANYWHERE) {
    try {
      const started = performance.now();
      const found = await explore({ said, shown, apiKey, signal: request.signal });
      return Response.json({ order: { lines: [] }, priced: EMPTY_PRICED, accepted: null, nutrition: false, done: false, pay: false, ...found, ms: Math.round(performance.now() - started) });
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      console.error("explore failed", error);
      return Response.json({ error: "The interpreter could not be reached." }, { status: 502 });
    }
  }
  const menu = getMenu(body?.restaurant);
  if (!menu) return Response.json({ error: "Unknown restaurant." }, { status: 400 });

  try {
    const result = await interpret({
      menu,
      restaurantId,
      before: sanitizeOrder(menu, body?.before),
      said,
      shownSuggestions: shown,
      shownCombo: typeof body?.shownCombo === "string" ? body.shownCombo.slice(0, 2000) : undefined,
      apiKey,
      signal: request.signal,
    });
    const sheet = result.reviews ? reviewSheet(restaurantId, menu, result.reviews) : null;
    const unreviewed = result.reviews?.kind === "item" ? menu.itemsById.get(result.reviews.id) : undefined;
    return Response.json({
      order: result.order,
      priced: priceOrder(menu, result.order),
      suggestion: result.curate ?? (result.suggest ? toSuggestion(menu, result.suggest) : null),
      accepted: result.accepted,
      nutrition: result.nutrition,
      done: result.done,
      pay: result.pay,
      reviews: sheet,
      reviewsMissing: result.reviewsAsked && !sheet ? `I don't have any guest reviews of ${unreviewed ? `the ${unreviewed.name.toLowerCase()}` : menu.restaurant.name} yet.` : null,
      ms: result.ms,
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("interpret failed", error);
    return Response.json({ error: "The interpreter could not be reached." }, { status: 502 });
  }
}
