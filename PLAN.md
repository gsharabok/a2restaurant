# Voice Waiter: hackathon plan

Repo: https://github.com/zarina-kassen/agent2restaurant (empty today)
Reference experience: https://x.com/kunalabcdani/status/2119892841723990319
Status: phase 1 (one-way demo) is built and tagged `v0.1-one-way-demo`. Phase 2 (waiter voice) is built on top of it; see README.md. Research done 2026-11-14.

## 1. The demo in one paragraph

**Phase 1 is one-way: the guest talks, the screen responds, the agent does not speak.** A guest opens a page for one restaurant and starts talking. As they say "poached eggs, a side of bacon, an almond croissant and a flat white", each item appears on screen while they are still mid-sentence, with its options and a running total. They change their mind out loud and the screen follows. They ask "something healthy?" and suggestion cards appear with a one-line caption.

Phase 2 plugs in the waiter's voice on top of the same parts. Phase 3 is the business page (menu upload, Google Maps link).

The one thing that must be excellent: **the order moving on screen as fast as speech.** Everything else is cut before that is.

## 2. What the reference video does

I watched the video frame by frame. It is 34 seconds of coffee ordering:

- A dark, near-empty canvas. One card per drink: an image, the name, and four option rows (size, shots, milk, hot/iced) with the chosen value lit.
- A transcript bar at the bottom. Settled words are white, unsettled words are grey.
- Cards appear and change mid-sentence: "a matcha" draws a Matcha Latte, "let's make it iced" swaps the image to the iced one, "one more latte" adds a card, "make that one iced" changes the right card, "get rid of the cappuccino" removes one.
- The author reports about 200 ms from word to screen and says it is built on Jev, a model from TypeSafe AI.
- The UI itself is fixed and hand-designed. Only the state is driven by voice.

What that tells us: the effect comes from interpreting **partial transcripts** against a **fixed menu**, many times per second. A speech-to-speech agent that calls tools after the guest stops talking cannot produce it. That changes the architecture from my first plan.

## 3. Architecture: two lanes, one order

```
mic --> streaming speech-to-text (interim words every few hundred ms)
            |
            |-- every partial --> FAST LANE: interpreter(turn-start order, menu, words so far)
            |                        returns the whole order --> screen
            |
            '-- end of turn ----> SLOW LANE: waiter(final words, order, restaurant facts)
                                     returns { caption, suggested item ids }
                                     phase 1: caption + cards on screen
                                     phase 2: the same caption is also spoken
```

**Fast lane (phase 1, the hero).**
- Input: the order as it was when the guest started this turn, the menu, and everything said so far this turn.
- Output: the complete order, not a patch. Each new partial is re-interpreted from the turn-start order, so when the transcriber revises a word the screen corrects itself and nothing is added twice.
- Stale requests are aborted; only the newest answer is rendered.
- The server validates every item and option against the menu and computes the total. The model never produces a price.

**Slow lane (phase 1 silent, phase 2 spoken).**
- Runs once the guest stops talking, and only when the turn was a question or a request for advice. It reads the order; it does not change it.
- It returns a short caption and a list of suggested item ids. In phase 1 these render as cards with the caption. If the guest says "add that", the fast lane adds it (the last suggestion is part of the fast lane's input).
- Phase 2 adds text-to-speech on the caption, one upsell per order, a read-back at confirmation, and stopping playback when the guest talks. Nothing in phase 1 has to change for this: the seam is the `{ caption, suggestions }` response.

**Interpreter: two candidates behind one function.**

| | Jev (TypeSafe) | Fast LLM with JSON-schema output |
| --- | --- | --- |
| Evidence | It is what the reference used. Returns typed choices with probabilities, no text. Their docs include a cafe "shopping cart" recipe. | Standard technique; any low-latency model |
| Fit | Good for "which item, which option" from a closed list | Handles free-form cases naturally: two of the same item with different options, "a little bacon" |
| Unknowns | Access: their site mentions a waitlist; Vercel AI Gateway is listed as a way in without it (to confirm). The cookbook finds items with one request per item, so many items may mean several round trips. | Latency per call, which I have not measured |

Plan: try Jev first for one hour. If we cannot get a key, or two-lattes-with-different-options is awkward, switch to the LLM. The rest of the app does not care which is used.

**Speech.** Phase 1 uses ElevenLabs realtime speech-to-text through its React hook, which delivers partial words as the guest speaks. Chrome's built-in speech recognition is the no-key fallback (it is what `jev-voice-browser` uses). Partial words get revised either way; full-order re-interpretation is what makes that harmless. Phase 2 adds ElevenLabs text-to-speech on the same key.

**App.** One Next.js + TypeScript app with shadcn/ui. Server routes: `/api/scribe-token` and `/api/interpret` (phase 1), `/api/waiter` (phase 1 for captions and cards, phase 2 adds speech), `/api/onboard` (phase 3). No database: restaurants are JSON files, orders live in memory. It runs locally on the demo laptop; a public deploy is optional.

## 4. Reuse, not build

Everything except the menu JSON, the card design and about one file of glue comes from something that already exists.

| Need | Reuse | What it gives us |
| --- | --- | --- |
| Mic to live words | ElevenLabs realtime speech-to-text, `useScribe` hook from `@elevenlabs/react` | Partial and committed transcripts in a React hook; the browser connects with a single-use token minted by one server route |
| Transcript bar | ElevenLabs UI `SpeechInput` component (ui.elevenlabs.io) | Record button and live preview, shadcn-style, restyled to match the reference |
| Words to order | TypeSafe's "Shopping cart" cookbook | A worked cafe example: natural-language order to a structured cart with typed Choice questions |
| Partial-transcript loop | `moritzkremb/jev-voice-browser` (MIT) | Working code for debounce, aborting stale calls and acting per spoken word; its author reports 250-350 ms per call |
| Jev access | Vercel AI Gateway lists Jev with no TypeSafe waitlist; otherwise a key from the TypeSafe console | One gateway key would also cover the fallback LLM |
| LLM fallback | TypeSafe's official System One adapter (same request shape, backed by an ordinary LLM) | Swap interpreter without changing our code |
| Cards and layout | shadcn/ui + Tailwind, Framer Motion for enter, exit and change animations | No custom component library |
| Phase 2 voice | ElevenLabs text-to-speech streaming on the same key | The waiter speaks the caption the slow lane already returns |
| Phase 2 reference | `vivekvt/VoiceThruAI` (ElevenLabs agent with cart client tools; no licence, read only) | A pattern to follow if we later want a full conversational agent |
| Phase 3 menu upload | A vision LLM with structured output, same gateway key | PDF or photo to menu JSON |
| Phase 3 Google data | Places API (New) | Rating, review summary, up to 5 reviews |

Considered and not used for phase 1:
- **A hosted voice agent (ElevenLabs Agents, Cartesia agents, OpenAI Realtime) driving the screen through tool calls.** Easiest to set up, but the tool calls arrive after the guest finishes a sentence, so it cannot give the mid-sentence effect in the reference. It stays the option for phase 2 if plain text-to-speech feels too thin.
- **Cartesia.** Its Ink 2 speech-to-text also streams partial text with built-in turn detection, and it has browser access tokens. ElevenLabs is picked only because its React hook and UI component save more code; either works behind the same interface.
- **A2UI / AG-UI / json-render.** Built for an agent that invents layouts. Our layout is fixed and only the state changes, as in the reference, so a generic renderer adds work. They belong in the protocol story after the hackathon.
- **`julianoczkowski/jev-demo`** (Next.js + Jev, speak-a-UI). Closest in spirit, but it has no licence, so it is reading material only.

## 5. Screen

Modelled on the reference, adapted from drinks to a table:

- Dark canvas, greeting in the centre until the first item arrives.
- One card per order line: cut-out image, name, option rows with the chosen value lit, price. Cards animate in, out, and on change.
- Running total at the top right.
- Transcript bar at the bottom with settled and unsettled words in two tones.
- Suggestion cards slide in above the transcript bar when the waiter recommends.
- A small "listening / speaking" indicator. No chat log.

Images: for the seeded restaurant, one cut-out per item (and per visible variant, such as iced vs hot), generated before the hackathon clock matters. For an uploaded menu, a generic image per category.

## 6. Scope

**Phase 1: one-way demo**
- One seeded restaurant: **Kaffeine, 66 Great Titchfield St, London W1W 7QJ**, a speciality coffee shop in Fitzrovia a few streets from 15 Rathbone St (I have not measured the walk). Chosen because it publishes a full, priced food menu (dated 9 Nov 2026) that fits the brief: brunch eggs, brioche with bacon and egg, pastries, salads.
- About 15 items taken from that menu, for example: Poached Eggs on sourdough (14.00), Eggs Benedict (16.50), Avo Smash (14.00), brioche with bacon and fried egg (10.50), granola with yoghurt (10.00), fruit salad (8.50), the goat's curd salad (10.00 / 12.00), croissant (3.60), almond croissant (4.40), banana bread (4.70). Extras become options: streaky bacon, poached egg, smashed avocado, smoked salmon.
- Coffee: espresso, flat white, latte, cappuccino, batch filter, with milk (whole, oat, almond), hot or iced, extra shot. Kaffeine's page does not list coffee or extras prices, so those are placeholder prices until someone checks in the shop. Hash browns are not on their menu; the demo sentence uses bacon and avocado as sides instead.
- Live order by voice: add, change options, change quantity, remove.
- Silent suggestions: "something healthy" or "what's popular" shows cards and a caption.

**Phase 2: waiter voice**
- The caption is spoken; one upsell per order; read-back at the end; guest can interrupt.

**Phase 3: business page**
- Upload menu, paste Google Maps link, see the extracted menu and Google rating.

**Out**
Payment, kitchen or POS hand-off, accounts, database, multiple languages, allergen advice, the open protocol itself (one closing slide: the menu schema and the interpreter contract are the protocol seed).

## 7. Build order

Each step ends in something demoable. Stop at any line and there is still a demo.

| # | Step | Done when |
| --- | --- | --- |
| 0 | Keys added, Next.js + shadcn scaffold, Kaffeine menu JSON, item images | App runs on the laptop with the menu loaded |
| 1 | Mic to transcript bar using `useScribe` and `SpeechInput` | Words appear as spoken, two tones |
| 2 | Interpreter spike, adapting the shopping-cart cookbook: Jev vs LLM on 10 scripted utterances | One is chosen; word-to-screen time is measured |
| 3 | Fast lane end to end with plain cards, loop logic adapted from `jev-voice-browser` | The demo sentence fills the order mid-sentence, including one correction |
| 4 | Card design, images, animation, total | It looks like the reference |
| 5 | Silent suggestions: caption and cards, "add that" | "Something healthy?" shows cards; "add that" adds one |
| **end of phase 1** | *One-way demo is complete and rehearsed* | Three clean scripted runs in a row |
| 6 | Phase 2: speak the caption with ElevenLabs text-to-speech, upsell, read-back, interruption | The waiter answers aloud without slowing the screen |
| 7 | Phase 3: menu PDF to extracted menu, Maps link to rating and review summary | A second restaurant can be created live |

Steps 1-3 (speech and interpreter) and step 4 (screen) can run in parallel against the shared menu JSON. Step 5 is the first thing to drop if phase 1 runs late.

## 8. Demo script, phase 1 (about 1 minute)

1. "Can I get the poached eggs with a side of bacon, an almond croissant, and a flat white." Cards appear as each word lands. (15 s)
2. "Actually make that an iced latte with oat milk. And no bacon, add avocado." Screen follows. (10 s)
3. "I want something healthy too." Cards and a caption appear. "Add the first one." (15 s)
4. "That's it." Order summary and total. (5 s)

Phase 2 adds the spoken answers and the upsell; phase 3 adds a 20-second business opening (menu upload, Maps link).

## 9. Risks

| Risk | Plan |
| --- | --- |
| No Jev access in time | LLM interpreter is the fallback; decided in step 2 |
| Speech-to-text partials are too slow or unstable | Measured in step 1; Chrome's built-in recognition and Cartesia Ink 2 are drop-in alternatives |
| Interpreter too slow for the mid-sentence effect | Small menu, short prompt, abort stale calls; measure in step 2 before building on it |
| Venue noise and wifi (both speech and interpreter need a connection) | Headset or close mic, push-to-talk toggle, phone hotspot, pre-recorded backup video |
| Cards flicker when partials are revised | Only animate differences; apply removals only after the word is settled |
| "Most popular dish" has no Google source | Google's Places API returns a rating, an AI review summary and at most 5 reviews, and I found no popular-dishes field. For the demo, popularity is a field in the menu JSON plus the review summary. |
| Google Business Profile (owner's own data) | Needs an access request reviewed over up to 14 days. Not usable for a hackathon; use Places API with an API key. |
| Two models editing one order | Only the fast lane writes the order |
| Voice added later disrupts the fast screen | Phase 2 only consumes the slow lane's existing output; it never touches the fast lane |

## 10. Setup and decisions

**Decided**
- Demo device: a laptop, in Chrome.
- Restaurant: Kaffeine (section 6). Swappable by editing one JSON file.
- Reuse first: see section 4.

**Keys**
- This Devin workspace has no stored API keys today.
- Devin itself cannot be the live interpreter: the fast lane needs an answer in a fraction of a second, many times per sentence, which needs a model API. Devin's role is building the app.
- Phase 1 needs two keys: **ElevenLabs** (speech-to-text now, voice in phase 2) and one for the interpreter, either **Vercel AI Gateway** (listed as serving Jev and ordinary LLMs) or a **TypeSafe** key from https://console.typesafe.ai/keys.
- Each needs an account with an email and billing owner, so one of you creates them and adds them to Devin's secrets when the build starts. They then stay available to every later session.
- Phase 3 adds a Google Maps Platform key.
- Cost is small: Jev is listed at $0.042 per million input tokens with free output. A few dollars of credit per service covers the hackathon.

## Sources

- Reference post and video: https://x.com/kunalabcdani/status/2119892841723990319
- Jev introduction and question types: https://docs.typesafe.ai/introduction
- Jev shopping-cart recipe: https://docs.typesafe.ai/cookbooks/cart_from_primitives
- Jev models and pricing: https://docs.typesafe.ai/models
- Streaming transcription rankings: https://opentranscription.io/en/ranker/realtime
- OpenAI voice agent architectures: https://developers.openai.com/api/docs/guides/voice-agents
- ElevenLabs client-side realtime speech-to-text: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming
- ElevenLabs UI speech input: https://ui.elevenlabs.io/docs/components/speech-input
- ElevenLabs React SDK (agents, client tools): https://elevenlabs.io/docs/eleven-agents/libraries/react
- Cartesia streaming speech-to-text: https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/05-node/04-real-time-speech-to-text.mdx
- jev-voice-browser: https://github.com/moritzkremb/jev-voice-browser
- awesome-jev (community projects, Vercel AI Gateway listing, System One adapter): https://github.com/hellogumbo/awesome-jev
- VoiceThruAI: https://github.com/vivekvt/VoiceThruAI
- Kaffeine menu: https://kaffeine.co.uk/location/66-great-titchfield-street/
- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- Place Details (New): https://developers.google.com/maps/documentation/places/web-service/place-details
- Review summaries: https://developers.google.com/maps/documentation/places/web-service/review-summaries
- Business Profile API access: https://developers.google.com/my-business/content/faq
