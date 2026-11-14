# a2restaurant

A voice waiter for restaurants. The guest says what they want and the order builds on screen while they are still talking. The waiter answers out loud when there is something to say, and stays quiet when the guest is simply ordering. See [PLAN.md](PLAN.md) for the full plan.

The one-way version (screen only, no voice) is tagged `v0.1-one-way-demo`: `git checkout v0.1-one-way-demo` brings it back. The mute button gives the same behaviour without switching versions.

The seed restaurant is [Kaffeine](https://kaffeine.co.uk/location/66-great-titchfield-street/), 66 Great Titchfield St, London. Food prices come from its published menu; drink and side prices are placeholders.

The dropdown at the top left switches restaurant. The second one is Starbucks UK (`/starbucks`): product names, descriptions, photos and nutrition come from its [published menu](https://www.starbucks.co.uk/menu), with photos loaded from Starbucks' own media library. Starbucks does not publish prices there, so every Starbucks price is a placeholder. Each restaurant is one JSON file in `src/data`, registered in `src/lib/menu.ts`.

## Run it

```bash
npm install
cat > .env.local <<'ENV'
TYPESAFE_API_KEY=your-key      # from https://console.typesafe.ai/keys
ELEVENLABS_API_KEY=your-key    # the waiter's voice; without it the app still works, silently
STRIPE_SECRET_KEY=sk_test_...  # optional: "Pay with Link" opens Stripe Checkout; without it, a demo checkout
ENV
npm run dev
```

Open http://localhost:3000 in Chrome (speech recognition uses Chrome's built-in Web Speech API).

- **Microphone button:** start or stop listening, then just talk.
- **Keyboard button:** type instead of speaking. The order updates on every keystroke; Enter ends the sentence.
- **Play button:** types the rehearsed demo order at speaking pace. Useful as a fallback on stage.
- **Reset button:** clears the order.
- **Speaker button:** mutes or unmutes the waiter.
- **Headphones button:** turn it on when you wear headphones. Then speaking cuts the waiter off mid-sentence. Leave it off on laptop speakers (see below).

## The waiter's voice

The waiter speaks only after the guest has finished a sentence, never over them:

| The guest | The waiter |
| --- | --- |
| orders or changes something | says nothing; the screen shows it |
| asks a question ("anything healthy?") | says the caption and names the dishes on the cards |
| accepts a suggestion ("add the first one", "yes please") | "Lovely, fruit salad added." |
| asks about nutrition | says the calories and protein of the order |
| pauses after ordering, once per order | offers one dish that goes with the order; "yes please" adds it |
| says "that's it" | reads the order back with the total |

Every spoken line is built in code from the order and the menu (`src/lib/waiterSay.ts`), so prices and nutrition are never made up by a model. `/api/speak` streams the line from ElevenLabs (`eleven_flash_v2_5`) and the browser plays it as it arrives. The voice is "Lucy"; set `ELEVENLABS_VOICE_ID` in `.env.local` to use another.

Typing, or clicking the line the waiter is saying, stops it at once. On laptop speakers the microphone would hear the waiter and take its words for an order, so the microphone is ignored while the waiter talks and for a moment after. With the headphones button on, that is not needed and the guest's voice interrupts the waiter.

## How it works

1. Speech-to-text gives the words so far, several times a second (`src/hooks/useSpeech.ts`).
2. Each change is sent to `/api/interpret` with the order as it stood when the sentence began. An older request still in flight is aborted (`src/hooks/useLiveOrder.ts`).
3. The route asks [Jev](https://typesafe.ai) one batched question set: a quantity for every menu item, each option of each drink, whether the guest wants a recommendation, and whether they are finished (`src/lib/interpret.ts`).
4. Code validates the answer against the menu and computes prices (`src/lib/order.ts`). The model never produces a price.
5. React renders one card per order line and animates the differences. The picture on each card follows the order too (`src/components/ItemArt.tsx`): it grows with the size, steams when hot, and takes ice when iced. Kaffeine drinks are drawn in code (`DrinkArt.tsx`); Starbucks photos keep every variant loaded so a switch shows at once. These are decoration on an order that is already drawn, so none of them delays an update.
6. When the sentence ends, `src/hooks/useWaiterVoice.ts` decides whether the waiter answers, and plays the line.

Because every update re-reads the whole sentence against the order from before the sentence, corrections ("a cappuccino, no wait, a mocha") fix the screen instead of stacking up.

## Checks

```bash
npm run spike   # scripted orders through Jev: accuracy and latency
npm run lint
npm run build
```

## Credits

Item artwork is from [Twemoji](https://github.com/jdecked/twemoji), licensed CC-BY 4.0.
