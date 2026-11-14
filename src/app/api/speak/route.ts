/** The waiter's voice: turns one short line into streamed speech with ElevenLabs. */
const MODEL = "eleven_flash_v2_5";
/** "Lucy": young, British, conversational. Any id from /v1/voices works. */
const DEFAULT_VOICE = "lcMyyd2HUfFzxdCaC4Ta";
const MAX_CHARS = 500;
const MAX_CACHED = 60;

/** Lines repeat (captions, rehearsed demo), so a spoken line is only bought once per server run. */
/** Holds lines still being generated too, so a line asked for twice at once is only generated once. */
const cache = new Map<string, Promise<Uint8Array<ArrayBuffer> | null>>();

const HEADERS = { "content-type": "audio/mpeg", "cache-control": "no-store" };

export async function GET(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ELEVENLABS_API_KEY is not set. Add it to .env.local and restart." }, { status: 500 });
  }
  const text = (new URL(request.url).searchParams.get("text") ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });

  const voice = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE;
  const cacheKey = `${voice}:${text}`;
  const cached = await cache.get(cacheKey);
  if (cached) return new Response(cached, { headers: HEADERS });

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: MODEL }),
        signal: request.signal,
      },
    );
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("speak failed", error);
    return Response.json({ error: "The voice service could not be reached." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    console.error("speak failed", upstream.status, (await upstream.text()).slice(0, 300));
    return Response.json({ error: "The voice service refused the request." }, { status: 502 });
  }

  // Audio goes to the browser as it arrives; a copy is kept once the whole line is in.
  const [toBrowser, toCache] = upstream.body.tee();
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  const audio = new Response(toCache)
    .arrayBuffer()
    .then((buffer) => new Uint8Array(buffer))
    .catch(() => null);
  cache.set(cacheKey, audio);
  audio.then((done) => {
    if (!done && cache.get(cacheKey) === audio) cache.delete(cacheKey);
  });
  return new Response(toBrowser, { headers: HEADERS });
}
