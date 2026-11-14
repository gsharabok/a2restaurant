import { interpret } from "@/lib/interpret";
import { priceOrder, sanitizeOrder } from "@/lib/order";
import { suggestionsFor } from "@/lib/suggest";

export async function POST(request: Request) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "TYPESAFE_API_KEY is not set. Add it to .env.local and restart." }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as {
    before?: unknown;
    said?: unknown;
    shownSuggestions?: unknown;
  } | null;
  const said = typeof body?.said === "string" ? body.said.slice(0, 2000) : "";
  const shown = Array.isArray(body?.shownSuggestions) ? body.shownSuggestions.map(String).slice(0, 3) : [];

  try {
    const result = await interpret({
      before: sanitizeOrder(body?.before),
      said,
      shownSuggestions: shown,
      apiKey,
      signal: request.signal,
    });
    return Response.json({
      order: result.order,
      priced: priceOrder(result.order),
      suggestion: result.suggest ? suggestionsFor(result.suggest, result.order) : null,
      accepted: result.accepted,
      done: result.done,
      ms: result.ms,
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("interpret failed", error);
    return Response.json({ error: "The interpreter could not be reached." }, { status: 502 });
  }
}
