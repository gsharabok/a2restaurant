import { tooMany } from "@/lib/rateLimit";
import { getMenu } from "@/lib/menu";
import { interpret } from "@/lib/interpret";
import { priceOrder, sanitizeOrder } from "@/lib/order";
import { toSuggestion } from "@/lib/suggest";

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
  const menu = getMenu(body?.restaurant);
  if (!menu) return Response.json({ error: "Unknown restaurant." }, { status: 400 });
  const said = typeof body?.said === "string" ? body.said.slice(0, 2000) : "";
  const shown = Array.isArray(body?.shownSuggestions) ? body.shownSuggestions.map(String).slice(0, 4) : [];

  try {
    const result = await interpret({
      menu,
      before: sanitizeOrder(menu, body?.before),
      said,
      shownSuggestions: shown,
      shownCombo: typeof body?.shownCombo === "string" ? body.shownCombo.slice(0, 2000) : undefined,
      apiKey,
      signal: request.signal,
    });
    return Response.json({
      order: result.order,
      priced: priceOrder(menu, result.order),
      suggestion: result.curate ?? (result.suggest ? toSuggestion(menu, result.suggest) : null),
      accepted: result.accepted,
      nutrition: result.nutrition,
      done: result.done,
      pay: result.pay,
      ms: result.ms,
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("interpret failed", error);
    return Response.json({ error: "The interpreter could not be reached." }, { status: 502 });
  }
}
