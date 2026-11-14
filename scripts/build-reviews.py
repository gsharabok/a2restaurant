# Builds src/data/kaffeine-reviews.json from the saved Google Maps data of the reference project.
# Run from the repo root with that project's data/kaffeine.json and data/kaffeine.raw.json under ./data.
import json, re
src = json.load(open('data/kaffeine.json'))
raw = json.load(open('data/kaffeine.raw.json'))
IDS = {"poached_eggs":"poached-eggs","avo_smash":"avo-smash","eggs_florentine":"eggs-florentine","drunken_mushrooms":"drunken-mushrooms","espresso_pancakes":"espresso-pancakes","bacon_egg_brioche":"bacon-and-egg-brioche","veggie_egg_brioche":"fried-egg-brioche","granola":"paleo-granola","sourdough_toast":"sourdough-toast","goats_curd_salad":"goat-s-curd-salad","sausage_roll":"pork-belly-sausage-roll","croissant":"french-butter-croissant","almond_croissant":"almond-croissant","pain_au_chocolat":"pain-au-chocolat","banana_bread":"banana-bread","brownie":"mini-chocolate-brownie","portuguese_tart":"portuguese-tart","side_avocado":"smashed-avocado","espresso":"espresso","americano":"americano","flat_white":"flat-white","latte":"latte","cappuccino":"cappuccino","mocha":"mocha","filter":"filter-coffee","hot_chocolate":"hot-chocolate","tea":"tea"}
TOPICS = {"coffee":"Coffee","service":"Service","atmosphere":"Atmosphere","food":"Food","pastries_and_cakes":"Pastries & cakes","busy_and_seating":"Queues & seating","price":"Price"}
def clean(t): return re.sub(r'\s+', ' ', (t or '').replace('… More','…')).strip()
def card(c):
    return {"author": c["author"], "info": c.get("author_info") or "", "rating": c["rating"], "when": c["when"], "text": clean(c["text"]),
            "photos": [p for p in c.get("photos", []) if p.startswith("https://")][:2], "reply": clean(c.get("owner_response")) or None}
def block(r, n=6):
    return {"mentions": r["mentions"], "average": r["average_rating"], "positiveShare": r["positive_share"],
            "distribution": [r["distribution"].get(str(s), 0) for s in (5,4,3,2,1)],
            "quotes": [{"text": clean(q["text"]), "author": q["author"], "rating": q["rating"], "when": q["when"]} for q in r["quotes"][:3]],
            "cards": [card(c) for c in r["cards"][:n]]}
by = {p["id"]: p for p in src["products"]}
items = {}
for ours, ref in IDS.items():
    p = by[ref]; r = p["reviews"]
    if not r or not r.get("mentions"): continue
    items[ours] = {**block(r), "summary": p.get("review_summary") or p.get("say_reviews"), "say": p.get("say_reviews"),
                   "photos": [x["src"] for x in p.get("photos", []) if x["src"].startswith("https://")][:4]}
g = raw["ratings"]["google"]
best = sorted([r for r in raw["google_reviews"] if r["rating"] >= 4 and 180 < len(r["text"]) < 520 and not r.get("truncated")], key=lambda r: -len(r.get("photos", [])))[:5]
low = [r for r in raw["google_reviews"] if r["rating"] <= 3 and 120 < len(r["text"]) < 420 and not r.get("truncated")][:1]
out = {
  "source": {"name": "Google", "url": src["restaurant"]["google_maps_url"], "basis": src["notes"]["reviews_basis"], "averageNote": "Stars are those of the reviews that mention it, not a score for the dish itself."},
  "restaurant": {"rating": src["restaurant"]["rating"], "count": src["restaurant"]["review_count"],
     "distribution": [g["collected_distribution"].get(str(s), 0) for s in (5,4,3,2,1)], "collected": g["collected_reviews"],
     "summary": "Guests come for the coffee and stay for the baking: the flat white and banana bread are the most praised, the staff are called warm and quick, and the usual gripe is that it is busy and seats are scarce.",
     "say": src["restaurant"]["say_rating"],
     "cards": [card({**r, "when": r["date"], "author_info": r.get("author_info")}) for r in best + low]},
  "topics": {k: {**block(src["review_topics"][k], 5), "label": v} for k, v in TOPICS.items()},
  "items": items,
}
json.dump(out, open('src/data/kaffeine-reviews.json', 'w'), indent=1, ensure_ascii=False)
print(len(items), sorted(items), len(json.dumps(out)))
print(out["restaurant"]["distribution"], [ (len(c["text"]), c["rating"]) for c in out["restaurant"]["cards"]])
print(json.dumps(g)[:600])
print(max(len(c["text"]) for i in items.values() for c in i["cards"]))
print(items["flat_white"]["photos"][0]); print(out["restaurant"]["cards"][0]["photos"][:1])
