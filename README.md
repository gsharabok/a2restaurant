# a2restaurant

A voice waiter for restaurants. The guest says what they want and the order builds on screen while they are still talking. Phase 1 is one-way: the guest speaks, the screen answers, the agent does not talk back. See [PLAN.md](PLAN.md) for the full plan.

The seed restaurant is [Kaffeine](https://kaffeine.co.uk/location/66-great-titchfield-street/), 66 Great Titchfield St, London. Food prices come from its published menu; drink and side prices are placeholders.

## Run it

```bash
npm install
echo "TYPESAFE_API_KEY=your-key" > .env.local   # from https://console.typesafe.ai/keys
npm run dev
```

Open http://localhost:3000 in Chrome (speech recognition uses Chrome's built-in Web Speech API).

- **Microphone button:** start or stop listening, then just talk.
- **Keyboard button:** type instead of speaking. The order updates on every keystroke; Enter ends the sentence.
- **Play button:** types the rehearsed demo order at speaking pace. Useful as a fallback on stage.
- **Reset button:** clears the order.

## How it works

1. Speech-to-text gives the words so far, several times a second (`src/hooks/useSpeech.ts`).
2. Each change is sent to `/api/interpret` with the order as it stood when the sentence began. An older request still in flight is aborted (`src/hooks/useLiveOrder.ts`).
3. The route asks [Jev](https://typesafe.ai) one batched question set: a quantity for every menu item, each option of each drink, whether the guest wants a recommendation, and whether they are finished (`src/lib/interpret.ts`).
4. Code validates the answer against the menu and computes prices (`src/lib/order.ts`). The model never produces a price.
5. React renders one card per order line and animates the differences.

Because every update re-reads the whole sentence against the order from before the sentence, corrections ("a cappuccino, no wait, a mocha") fix the screen instead of stacking up.

## Checks

```bash
npm run spike   # scripted orders through Jev: accuracy and latency
npm run lint
npm run build
```

## Credits

Item artwork is from [Twemoji](https://github.com/jdecked/twemoji), licensed CC-BY 4.0.
