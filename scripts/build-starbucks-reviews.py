# Builds src/data/starbucks-reviews.json from a saved Google Maps page of one Starbucks branch.
# Run from the repo root with that file at ./data/starbucks.reviews.json.
import json, re
src = json.load(open('data/starbucks.reviews.json'))
# Our menu id -> the product ids the saved file uses. Iced versions are the same menu item here.
IDS = {"latte": ["caffe-latte", "iced-caffe-latte"], "hot_chocolate": ["classic-hot-chocolate"], "chai_latte": ["chai-latte"], "espresso": ["espresso"],
       "matcha_latte": ["matcha-latte", "iced-matcha-latte"], "mocha": ["caffe-mocha"], "white_mocha": ["white-chocolate-mocha"],
       "matcha_frappuccino": ["matcha-green-tea-cream-frappuccino-blended-beverage"], "strawberry_acai": ["strawberry-acai-starbucks-refresha-drink"],
       "cold_brew": ["cold-brew-coffee"], "filter": ["filter-coffee"], "shaken_espresso": ["iced-brown-sugar-oat-shaken-espresso"], "flat_white": ["flat-white"],
       "coffee_frappuccino": ["coffee-frappuccino-blended-beverage"], "banana_loaf": ["banana-nut-loaf-cake"], "caramel_frappuccino": ["caramel-frappuccino-blended-beverage"],
       "brownie": ["triple-chocolate-brownie"], "espresso_macchiato": ["espresso-macchiato"], "caramel_macchiato": ["caramel-macchiato"]}
# The saved page has no per-topic grouping, so a topic is the reviews whose text contains one of these words.
TOPICS = {
  "coffee": ("Coffee & drinks", r"coffee|espresso|latte|cappuccino|flat white|americano|drinks?|frappuccino|matcha|tea"),
  "service": ("Staff & service", r"staff|service|baristas?|served|rude|friendly|polite|helpful"),
  "cleanliness": ("Cleanliness", r"clean\w*|dirty|toilets?|filthy|mess\w*|hygiene"),
  "seating": ("Seating & space", r"seat\w*|downstairs|upstairs|spac\w+|tables?|sit|basement|cosy|cozy"),
  "busy": ("Queues & speed", r"busy|queues?|crowded|wait\w*|slow|quick\w*|fast"),
  "food": ("Food", r"food|sandwich\w*|cakes?|croissants?|muffins?|cookies?|pastr\w+|breakfast|toasties?|paninis?|brownies?"),
  "price": ("Price", r"prices?|expensive|cheap|overpriced|value|pricey"),
}
def clean(t): return re.sub(r'\s+', ' ', (t or '').replace('… More', '…')).strip()
def card(r):
    text = clean(r["text"])
    if r.get("truncated") and not text.endswith("…"): text += "…"
    return {"author": r["author"], "info": r.get("author_info") or "", "rating": r["rating"], "when": r["when"], "text": text,
            "photos": [p for p in r.get("photos", []) if p.startswith("https://")][:2], "reply": clean(r.get("owner_response")) or None}
def sentence(text, about):
    # The sentence that talks about the subject, not just the review's opening line.
    parts = re.split(r'(?<=[.!?])\s+', text)
    first = next((part for part in parts if about and re.search(about, part.lower())), parts[0])
    return first if len(first) <= 160 else first[:157].rsplit(' ', 1)[0] + "…"
def block(rs, n, about):
    # Readable, complete reviews first; the order is otherwise the page's own.
    ranked = sorted(rs, key=lambda r: (not (60 < len(r["text"]) < 520), bool(r.get("truncated"))))
    # Quotes follow the mix of ratings, so a subject with unhappy reviews shows one.
    share = sum(r["rating"] >= 4 for r in rs) / len(rs)
    good, bad = [r for r in ranked if r["rating"] >= 4], [r for r in ranked if r["rating"] <= 3]
    want = min(len(bad), 0 if share > 0.85 else 1 if share >= 0.5 else 2 if share > 0.15 else 3)
    picked = (good[:3 - want] + bad[:want]) if len(rs) > 3 else ranked
    ranked = picked + [r for r in ranked if r not in picked]
    return {"mentions": len(rs), "average": round(sum(r["rating"] for r in rs) / len(rs), 1),
            "positiveShare": round(sum(r["rating"] >= 4 for r in rs) / len(rs), 2),
            "distribution": [sum(r["rating"] == s for r in rs) for s in (5, 4, 3, 2, 1)],
            "quotes": [{"text": sentence(clean(r["text"]), about(r)), "author": r["author"], "rating": r["rating"], "when": r["when"]} for r in ranked[:3]],
            "cards": [card(r) for r in ranked[:n]]}
reviews = [r for r in src["reviews"] if r["text"].strip()]
by = {r["id"]: r for r in reviews}
items = {}
for ours, refs in IDS.items():
    ids = list(dict.fromkeys(i for ref in refs for i in src["products"][ref]["review_ids"]))
    # "Iced matcha latte" is a review of the matcha latte, not of the plain latte the file also lists it under.
    def own(r, refs=refs):
        mine = [i["matched_on"].lower() for i in r["items"] if i["id"] in refs]
        others = [(i["matched_on"].lower(), i["id"]) for i in r["items"] if i["id"] not in refs]
        text = r["text"].lower()
        # "iced matcha lattes" is matched as "iced matcha" plus "lattes": the word belongs to the other drink.
        def borrowed(m): return any(m.rstrip("s") in o or (f"{o} {m}" in text and m.rstrip("s") in ref) for o, ref in others) and len(re.findall(re.escape(m.rstrip("s")), text)) == 1
        return any(not borrowed(m) for m in mine)
    rs = [by[i] for i in ids if i in by and own(by[i])]
    def about(r, refs=refs):
        heard = [re.escape(i["matched_on"].lower()) for i in r.get("items", []) if i["id"] in refs]
        return "|".join(heard)
    if rs: items[ours] = {**block(rs, 6, about), "summary": None, "say": None, "photos": []}
topics = {}
for key, (label, words) in TOPICS.items():
    rs = [r for r in reviews if re.search(r'\b(%s)\b' % words, r["text"].lower())]
    pattern = r'\b(%s)\b' % words
    topics[key] = {**block(rs, 5, lambda r, pattern=pattern: pattern), "label": label}
place = src["restaurant"]
best = sorted([r for r in reviews if r["rating"] >= 4 and 140 < len(r["text"]) < 520 and not r["truncated"]], key=lambda r: -len(r["photos"]))[:4]
low = [r for r in reviews if r["rating"] <= 2 and 120 < len(r["text"]) < 420 and not r["truncated"] and "*" not in r["text"]][:2]
out = {
  "source": {"name": "Google", "url": "https://www.google.com/maps/search/?api=1&query=Starbucks+Coffee+126+Baker+St+London",
             "basis": f"Reviews of one branch, not the chain. From a Google Maps page of the {place['address']} branch saved on 2026-11-14, holding {src['collected_reviews']} of its {src['review_count']:,} reviews. Topics group the reviews that use related words.",
             "averageNote": "Stars are those of the reviews that mention it, not a score for the item itself."},
  "restaurant": {"title": f"Starbucks, {place['address'].split(',')[0]}", "rating": src["rating"], "count": src["review_count"],
     "distribution": [src["distribution"][str(s)] for s in (5, 4, 3, 2, 1)], "collected": src["collected_reviews"],
     "summary": "Guests mostly talk about the staff and the coffee, and like the seating downstairs. The complaints are about cleanliness and prices.",
     "say": f"The Baker Street Starbucks is rated {src['rating']} out of 5 from {src['review_count']:,} Google reviews.",
     "cards": [card(r) for r in best + low]},
  "topics": topics, "items": items,
}
json.dump(out, open('src/data/starbucks-reviews.json', 'w'), indent=1, ensure_ascii=False)
print(len(items), {k: (v["mentions"], v["average"]) for k, v in items.items()})
print({k: (v["mentions"], v["average"], v["positiveShare"]) for k, v in topics.items()})
for c in out["restaurant"]["cards"]: print(c["rating"], c["text"][:150])
for k in ("cleanliness", "seating", "price"): print(k, [q["text"] for q in topics[k]["quotes"]])
print(items["latte"]["quotes"])
