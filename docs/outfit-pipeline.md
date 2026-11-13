# Outfit suggestion: pipeline and tests

One way to build and test outfit suggestions. Other versions may follow; this
one is the starting point for the work on this branch.

The core idea: **every style rule is plain, tested code. The AI only chooses
among outfits that already pass the rules, and never invents a piece.**

## Sources

| Source | What it gives |
| --- | --- |
| `Layering_Rules.md` (Christoph's research) | Hard layering rules (below) |
| `Color rules.md` (Christoph's research) | Colour rules, plus HSL and LAB harmony ideas |
| Mens Fashioner: *Layering 101* (PDF) | Lightest fabric closest to the skin, max 3 layers, one pattern or bold colour, darkest on the outside, shorter items closest to the skin, polos alone or under a jacket |
| Mens Fashioner: *Dress Codes* (PDF) | What each dress code means, daytime vs evening colours, "slightly overdressed beats underdressed" |
| Mens Fashioner: *Spring & Summer Patterns + Color Combinations* (PDF) | 3 colours per outfit, proven pairs, leather and metal matching, shoe colour rules |
| [Fashionpedia](https://fashionpedia.github.io/home/Fashionpedia_download.html) | Test data only (see Test 3). No outfit or compatibility labels |
| [Acloset](https://www.acloset.app/it/) | The bar to compare against |
| [wardrobe-optimization](https://wardrobe-optimization-669a28.pages.ost.ch/) (OST, the project Christoph's rules come from) | More hard rules (H12–H16), seven scores to compare with, and a different search method. See "The other project" below |

### Things to sort out in the sources

- **The Word file is the wrong document.** "Regeln für Buisness Casual Men.docx"
  is a German prompt for an AI image generator that makes a beauty booklet
  (make-up, hairstyles, face analysis), not business casual rules. Ask
  Christoph for the real file. Editing faces also goes against this app's rule
  that faces never leave the phone.
- **The sources disagree about colour.** `Color rules.md` builds on
  colour-wheel harmony. The Spring & Summer PDF says the colour wheel "is
  mostly useless – disregard any advice suggesting it". Here, harmony is only
  a small bonus in the score, and Test 3 decides whether it earns more.
- **The rules are written for men's clothes.** The app also has dresses,
  skirts and blouses. Until rules exist for them, a dress is treated as top
  and bottom in one, and only the general rules (colour, formality, shoes)
  apply to it.

## What Acloset does, and where to do better

Acloset's "AI Stylist" builds outfits from your clothes "based on the weather
and your commitments", for today or a day in the next week. If you pick one
piece, "the AI completes the rest of the look". It shows a daily outfit on a
widget and lets you log what you wear in a calendar.

Its page says nothing about *why* an outfit was suggested, or how you tell it
you didn't like one. That's the gap:

- **Explain each outfit** with the rules it follows: "navy and white, darkest
  layer outside".
- **Learn from a simple answer:** worn / swapped a piece / not today.
- **Prefer pieces you rarely wear.** That's the app's purpose: wear what you
  own first.

## Rules

### Hard rules: an outfit that breaks one is dropped

| # | Rule | Source |
| --- | --- | --- |
| H1 | One top or one dress, one bottom unless it's a dress, one pair of shoes. Over a dress only a sweater, jacket or coat, not a T-shirt or blouse | Common sense |
| H2 | At most 3 visible layers on the upper body | Layering_Rules, Layering 101 |
| H3 | Layer order is base → shirt → sweater → jacket → coat. A piece may go over another only if it skips at most 2 layers (T-shirt under a jacket is fine, under a coat it isn't) and is not on the same step | Layering 101 ("Skip 2 layers – maximum"); Layering_Rules says "no more than two positions apart", first read as 2 steps, which Test 3 showed was too strict |
| H4 | A polo is worn alone or under a jacket (bomber, blazer) | Layering_Rules, Layering 101 |
| H5 | Over a collared shirt (dress shirt, oxford, chambray), only a V-neck sweater | Layering_Rules |
| H6 | At most 3 colours, not counting neutrals (white, black, gray, navy, beige, cream, tan). A neutral counts if it's a major piece such as a jacket. Accessories don't count unless they dominate | Color rules, Spring & Summer |
| H7 | At most one bold colour or one pattern other than solid. A matching set (same pattern and colour, such as a check suit) counts once | Layering 101, Spring & Summer |
| H8 | Leather shoes (dress shoes, loafers, boots): belt and leather watch strap are the same colour. Doesn't apply to sneakers | Color rules, Spring & Summer |
| H9 | Metals match: belt buckle, watch and jewellery are all silver or all gold | Color rules, Spring & Summer |
| H10 | Every piece is at most one formality step from what the occasion asks for | Dress Codes, `FORMALITIES` order |
| H11 | Every piece fits the season. In winter, transitional pieces fit too (a sweater is worn in winter); winter pieces don't fit spring or autumn | Common sense, Acloset |
| H12 | Black clothes: black shoes (or white sneakers) and a black belt. No black clothes: no black shoes or belt, except with a navy suit or an outfit of only gray and white | wardrobe-optimization, Spring & Summer |
| H13 | A base layer, shirt, sweater or dress is worn: no jacket on bare skin | wardrobe-optimization |
| H14 | No sweater over a flannel shirt | wardrobe-optimization |
| H15 | A cardigan has a T-shirt (base layer) under it | wardrobe-optimization |
| H16 | Three upper layers only in winter | wardrobe-optimization ("all top layers only if suitable for winter"), read as "3 layers" since H2 allows no more |

All 16 are in `src/shared/outfit/rules.ts`, each with its number as its id.
Decisions made while writing them:

- **Colours are compared by their main colour** (the first in `colors`), except
  H6, which counts all of them. "Black in the outfit" (H12) means a piece
  whose main colour is black, so a black print on a white tee doesn't count.
- **A plain "shirt" is treated as a dress shirt** (H5) until the tags say
  otherwise. That's the stricter reading: no crew-neck over an oxford.
- **Only a `sweater` with a V-neck passes H5.** A cardigan or hoodie over a
  dress shirt is dropped.
- **H4 accepts any `jacket` over a polo**, since `TYPES` doesn't tell a bomber
  from a parka.
- **H6 ignores accessories** (belt, bag, hat, socks) and gold and silver, as
  the PDF says accessories rarely count. Brown is not neutral: brown trousers
  read as a colour.
- **A dress sits where a base layer would**, so a cardigan over a dress
  passes H15.
- **Bold colours (H7):** red, yellow, orange, pink, purple, green. Muted
  ones (burgundy, olive) are not bold.

### Rules from wardrobe-optimization not taken (yet)

| Rule there | Why not |
| --- | --- |
| All pieces share at least one style | This app tags one style per piece, so it would mean "all pieces the same style": white sneakers (sporty) could never go with jeans (classic). Better as a soft bonus |
| All pieces share at least one season | Covered by H11: each piece fits the requested season |
| "Layer 3 and 4 can't be worn simultaneously" | Unclear which layers 3 and 4 are. If counted from 1 it forbids a sweater under a jacket, which Layering 101 recommends. Needs the source code or Christoph |

### Soft rules: they change the score, not the verdict

| # | Rule | Source |
| --- | --- | --- |
| S1 | Darker colours on the outside: light to dark from inner to outer layer (light jackets excepted) | Color rules, Layering 101 |
| S2 | Light with light, dark with dark | Spring & Summer |
| S3 | Shoes a different colour from the clothes, unless the outfit is all white or all black | Color rules |
| S4 | *Now hard rule H12.* White sneakers go with everything: a small bonus | Spring & Summer, Color rules |
| S5 | *Now hard rule H12* | Spring & Summer |
| S6 | Daytime lighter colours, evening darker (black, navy, charcoal) | Dress Codes |
| S7 | Proven pairs get a bonus: navy + white, olive/sage + tan, light blue + tan, green + blue, white + tan | Spring & Summer |
| S8 | Tonal match: colours within ΔE < 10 of each other go together | Color rules |
| S9 | Colour-wheel harmony (analogous, complementary, triadic). Small weight, see "sources disagree" | Color rules |
| S10 | Pieces not worn for a long time score higher. A reward only (0 to 1 × 1.5), never a penalty: with a penalty, a navy suit worn last week never came up for a cocktail evening | The app's purpose |

All in `src/shared/outfit/score.ts`, with the weights in `WEIGHTS`. Each part
of a score keeps its reason ("navy + white", "brings back the tan chore
jacket, not worn for 205 days"); the dev page shows them.

### Occasion → formality

From the Dress Codes PDF, mapped onto `FORMALITIES`:

| Occasion | Formality | Colours |
| --- | --- | --- |
| Sport | sport | – |
| Casual, daytime date, coffee | casual | Lighter |
| Elevated or smart casual, dinner, club | smart-casual | Darker in the evening |
| Business casual | smart-casual | – |
| Cocktail, semi-formal | formal (suit, no tie) | Evening: black, navy, charcoal. Daytime: tan, gray |
| Business formal, formal | formal | Navy or charcoal |
| Beach or summer chic | casual | Linen, light colours |

## What the tags need first

The rules use details the app doesn't record yet. In `src/shared/garment.ts`:

1. **Layer step:** `base | shirt | sweater | jacket | coat`, or none for
   bottoms, shoes and accessories. Asked of the model, or worked out from the
   type where it's clear. `TYPES` has no flannel, oxford, chambray, bomber,
   parka or peacoat, and the layering rules need them; adding types is the
   alternative.
2. **Shirt kind:** `dress | flannel | casual`. Dress covers dress shirt,
   oxford and chambray (H5); flannel takes no sweater (H14).
3. **Neckline:** `crew | v-neck | turtleneck | other`, for sweaters (H5).
4. **Metal:** `silver | gold | none`, for belts, watches and jewellery (H9).
5. **Accessory kind:** `watch` and `jewellery` became types of their own
   (H8 needs the watch).
6. **Colour table (no model change):** done, in `src/shared/outfit/colors.ts`.
   One typical shade per colour word, with LAB and HSL worked out from it.
7. **Wear log:** the date each piece was last worn (S10, and the feedback in
   step 5).

**Done (step 3) for 2–5,** in `src/shared/garment.ts`:

- The AI is asked for `shirtKind`, `neckline` and `metal` with every scan. Each
  applies to a few types only (shirt kind to shirts, neckline to sweaters,
  metal to belts, watches, jewellery and accessories); for every other type
  the answer is `"none"`, and `normalizeTags()` sets it so even if the model
  answers something else.
- **Pieces scanned before** don't have them. They stay valid (the details are
  optional in storage), and where a detail applies but is missing, the
  piece gets **"Please check"** on the closet grid and the detail shows
  "not set" in the label editor. Until then the rules use the default (a
  shirt counts as a dress shirt). Scanning the piece again also fills them in.
- **Correcting the type** in the label editor brings the details with it: a
  T-shirt corrected to a shirt asks for its shirt kind.
- The label editor only shows a detail for the types it applies to.

**Layer (1) is not asked.** The type gives it for every type except vest, which
stays out of outfits for now (a puffer vest is a jacket, a waistcoat is not).

The rules take an `OutfitPiece` (`src/shared/outfit/pieces.ts`): the tags,
plus optional fields that override them. Tests and fixture closets use the
fields; real pieces use the tags.

**For the tagging study:** the new details changed the prompt, so its
fingerprint in `logs/ai-calls.jsonl` changed too. Scans before and after are
not the same test: compare them only within one fingerprint.

## The other project: wardrobe-optimization

[wardrobe-optimization](https://wardrobe-optimization-669a28.pages.ost.ch/)
is a Python library from OST (Virtual Wardrobe project). Its layering and
colour rules match Christoph's notes almost word for word. The source on OST
GitLab wasn't reachable ("page not found"), so this is from its documentation
only.

| | wardrobe-optimization | This pipeline |
| --- | --- | --- |
| Search | Genetic algorithm (NSGA-III, pymoo), 8 slots: accessory, bottom, shoes, 5 top layers | Build every outfit after filtering by season and formality, then check and score |
| Same input, same answer | Only with a fixed random seed | Always |
| Colours | Read from the pixels: Mask-RCNN trained on Fashionpedia cuts out the garment, fast-colorthief picks its main colours, then HSL | 20 colour words from the tagger, with one shade each |
| Rules | 14 constraints | 16 hard rules (H1–H16) |
| Ranking | 7 objectives kept separate (best trade-offs) | One weighted score (S1–S10) |
| Runs | Python, on a computer | TypeScript, on the dev server or the phone |
| Testing | Example runs with fixed seeds, checked by eye | Tests 1–5 below, with numbers |

Its 7 objectives, to compare with S1–S10: colour harmony (distance to the
nearest harmony rule), hue cluster variance, two lightness gradients (inner
layers lighter), shoe contrast with the clothes, shoe and belt match, and
monochrome.

Why not the genetic algorithm here: a phone closet of about 100 pieces, after
the season and formality filters, is small enough to check every outfit. That
gives the same answer every time, which the tests need, and needs no Python.
If a large closet makes that too slow, candidates can be built greedily
(bottom, then shoes, then layers) instead.

What to take from it: reading colours from the pixels (it already did what
Test 3 plans), and its objectives as a check on our weights.

## Pipeline

```
Request: occasion, weather (or season), time of day, optional "start from this piece"
   │
   ▼
1. Candidates      top or dress + bottom + shoes, 0–2 layers, accessories.
                   Pieces that miss the season or are more than one formality
                   step off are removed before combining, to keep it small.
   │
   ▼
2. Hard rules      H1–H11. Each rule says which rule an outfit broke, so tests
                   and the dev page can show it.
   │
   ▼
3. Score           S1–S10, each with a weight. Each score keeps its reasons
                   ("navy + white", "darkest outside") for the explanation.
   │
   ▼
4. AI (optional)   The top ~10 outfits go to the model as tag lists with piece
                   IDs, never photos. It picks 3 and writes one line each.
                   The code checks every ID is in the list; if not, it falls
                   back to the 3 best scores.
   │
   ▼
5. Show 3 outfits  with the reasons. Answer: worn / swapped a piece / not today.
                   "Worn" updates the wear log.
```

Steps 1–3 are pure functions with no AI, so they run in `vitest` and on any
computer. Step 4 is optional on purpose: the app works without it, and Test 5
compares the two.

### Files

```
src/shared/outfit/
  pieces.ts        a piece as the rules see it: tags plus the fields still missing
  colors.ts        the colour table: lightness, HSL, LAB, neutral
  occasions.ts     occasion → formality and colour preference
  candidates.ts    step 1
  rules.ts         step 2: one function per hard rule
  score.ts         step 3: one function per soft rule, and the weights
  suggest.ts       steps 1–3 together
src/server/pick-outfits.ts   step 4, logged in logs/ai-calls.jsonl like tagging
src/app/api/outfit+api.ts    POST /api/outfit, behind the passcode
src/app/dev/outfits+api.ts   dev page: fixture closets and their suggestions
tests/outfit-rules.test.ts
tests/outfit-suggest.test.ts
tests/fixtures/closets/      casual.json, office.json, small.json, index.ts (loader and requests)
scripts/fashionpedia-check.ts
```

The AI step gets its own model setting, as `read-garment.ts` already plans:
"Outfit matching will get its own setting".

## Tests

### Test 1: each rule on its own (vitest)

Each rule gets ✅ and ❌ cases. Where the PDFs show an example, use it:

- Rust suede jacket + bright blue chinos + patterned shirt → breaks H7, and
  S2 gives a low score (Spring & Summer, "How to wear bold colours").
- Tan jacket + white tee + light jeans + black loafers → breaks H12: no black
  in the outfit (Spring & Summer, "Matching shoes").
- Gold necklace and rings + silver belt buckle → breaks H9 (Spring & Summer,
  "Matching metals").
- T-shirt + collared shirt + sweater + jacket → breaks H2 (Layering 101).
- T-shirt directly under a coat → breaks H3: three layers skipped. Directly
  under a jacket passes: two skipped (Layering 101).
- Check blazer + matching check trousers → one standout, passes H7; add a
  floral shirt and it breaks H7.
- Crew-neck sweater over an oxford shirt → breaks H5.
- Polo under a sweater → breaks H4.

Also test each rule's edges: exactly 3 colours passes, 4 fails, 4 with one
neutral passes.

All of these are in `tests/outfit-rules.test.ts`, plus one test that checks
every hard rule is broken by at least one outfit, so a rule that can never
fire (say, after a typo in a type name) is caught.

### Test 2: whole suggestions on fixture closets

Three sample closets in `tests/fixtures/closets/`: casual (30 pieces), office
(23) and small (12, with dresses and a skirt). For each closet and a fixed
set of requests (casual daytime, office, cocktail evening, beach, winter):

- No suggestion breaks a hard rule.
- The same closet and request always give the same result (no AI).
- The 3 suggestions differ in at least two pieces each.
- "Start from this piece" always contains that piece.
- An empty or tiny closet gives a clear "not enough pieces yet" result, never
  a crash.

Plus random closets: generate many, and check the hard-rule invariant holds
for every suggestion.

The builder drops half-built outfits early (upper body → bottom → shoes →
belt) so it stays fast: the biggest sample closet takes under 0.2 s. A test
checks that this shortcut changes nothing: on the small closet and on random
ones, it finds exactly the outfits that trying every subset of pieces finds.

All of this is in `tests/outfit-suggest.test.ts`.

The dev page at `http://localhost:8081/dev/outfits` (with `npx expo start`
running) shows each outfit's score, reasons, and the outfits that were
dropped and why, so the team can review by eye. Like `/dev/test`, it only
answers on this computer in development.

It shows two kinds of closet:

- **Test photos, as pictures.** The test photos (IT-01 to IT-60, "home" and
  "wish" together) as one closet, with the AI's tags from
  `logs/ai-calls.jsonl`. Set `OUTFIT_PHOTOS_DIR` in `.env` to the folder that
  holds them (searched through its subfolders) and restart the dev server.
  The photos are read where they are and never copied into the project
  (`src/server/test-photos.ts`). The tags are not checked by a person, so a
  wrong tag can explain a strange outfit.
- **The made-up sample closets**, which have no pictures: tags and colour dots
  only.

What the builder leaves out for now: accessories other than a belt (bag, hat,
watch, jewellery), and upper-body pieces with no known layer (a vest).

What the first look at the sample closets showed:

- Nothing makes a winter outfit include a coat: it can be a sweater and a
  jacket. A soft rule ("cold: a coat or a warm jacket") or the weather input
  could fix it.
- Sport pieces still come up for casual requests (gray joggers with an
  oxford), since sport is one formality step from casual.
- A polo under a blazer is ranked first for a cocktail evening in the office
  closet. It passes every rule, but a stylist might disagree: worth asking.

### Test 3: the rules against real outfits (Fashionpedia)

Fashionpedia has about 48k photos, many street style, each garment outlined
and labelled. It has no "these go together" labels, but each street-style
photo *is* a real outfit someone wore.

1. Take the street-style photos with a full outfit (top, bottom, shoes).
2. Map Fashionpedia's categories and attributes to the app's `TYPES`,
   neckline and pattern.
3. Get each garment's colour from the pixels inside its outline and map it to
   the nearest of the 20 `COLORS` (Fashionpedia has no colour labels).
4. Run the hard rules and the score.

The result is the **false-drop rate**: how many real outfits the rules throw
away. If it's high, a rule is too strict, and the dropped photos show which.
This is also where S9 (colour wheel) is settled: does colour-wheel harmony
score real outfits higher than random ones?

Licence: the annotations are CC BY 4.0. The images belong to their sources
(Flickr, Unsplash, Pexels and others), so they're used for testing here and
never shipped in the app. The data stays out of git.

**How to run it.** Download `instances_attributes_val2020.json` and
`val_test2020.zip` from the Fashionpedia page into
`data/fashionpedia/download/` (`data/` is in `.gitignore`), then:

```bash
python3 -I scripts/fashionpedia/extract.py   # needs numpy and Pillow → data/fashionpedia/outfits.json
npm run fashionpedia                         # rules and scores → data/fashionpedia/report.md
```

Only the validation set is used (1,158 photos, every one annotated). 759 of
them hold one complete outfit; 372 were incomplete, 15 too small to read and
12 showed more than one person.

**Shuffled outfits as the baseline.** A rule that drops real outfits isn't
necessarily wrong: people wear clashing clothes too. So each outfit is also
checked 10 times with each piece's colours and pattern taken from a random
piece of the same category (shoes take the donor's type too, since white
shoes are read as sneakers). Same shapes, random colours. A colour rule that
catches bad combinations should drop many more shuffled outfits than real
ones; layering rules stay at the same rate in both, by design.

**Results** (after the H3 and H7 fixes below):

| Rule | Real dropped | Shuffled dropped | Reading |
| --- | --- | --- | --- |
| H12 black | 29.6% | 45.4% | Prefers real outfits (ratio 1.5), but drops almost a third of them. The biggest question for the rule review |
| H3 layer gap | 6.9% | same | Was 16.2% when read as "2 steps"; most of that was a T-shirt under a jacket, which Layering 101 allows |
| H7 one standout | 6.2% | 7.4% | Was 8.2%; matching sets now count once. Ratio 1.2: a weak signal |
| H13 no jacket on skin | 5.7% | same | Mostly a data artifact: a closed jacket hides the top, so the photo has no top labelled |
| H1 | 4.6% | same | Tops over dresses in the photos |
| H5, H6, H15 | under 1% | | |
| Any judged rule | 42.6% | 56.2% | Colour rules alone: 33.1% vs 49.1% |

Outfits without a dress or skirt (290, closest to menswear) look the same:
47.6% dropped (shuffled 62.5%), H12 32.8%, H7 8.3%, H13 11.0%.

Soft rules (average points, real vs shuffled):

- S3 shoes match the clothes: real −0.277, shuffled −0.222. Real outfits
  match shoes to clothes *more* than random ones, so S3 punishes something
  people do on purpose. To review.
- S8 tonal: real 2.1% of outfits score, shuffled 0.4%. Works.
- S9 colour wheel: real 0.9%, shuffled 1.5%. No sign that it helps, which
  agrees with the Spring & Summer PDF calling the colour wheel useless. Keep
  its weight low or drop it.
- S1 is the same for both.

**Limits.** The photos are mostly womenswear (353 of 759 have a dress), and
reading colours from pixels leans towards black in shadows, which inflates
H12. Fashionpedia says nothing about formality, season, metal or most
materials, so H8–H11, H14 and H16 are not judged here.

### Test 4: the AI step

From `logs/ai-calls.jsonl`, per prompt version:

- How often the model returns an ID that wasn't in the list (should be 0
  after the check, but the raw rate shows how well it follows instructions).
- Whether the same input gives the same 3 outfits at temperature 0.
- How often its picks agree with the top 3 scores, and where they differ,
  whether people prefer the AI's picks (Test 5).
- Time per call and cost.

### Test 5: people

- **Blind comparison:** the same closets and requests, rules-only vs rules +
  AI. People rate each outfit 1–5 on "would you wear this?" without knowing
  which is which. A stylist rates them too, if one is available.
- **Explanations:** does the one-line reason make people trust the outfit
  more, or change it less?
- **In use:** share of suggestions marked "worn", how often a piece gets
  swapped (and which rule that points to), and how many suggestions bring in
  pieces not worn for 30+ days.

## Order of work

1. Colour table, occasion table, hard rules and Test 1. No tag changes, no AI.
   **Done:** `src/shared/outfit/` and `tests/outfit-rules.test.ts`.
2. Candidates, score, fixture closets, Test 2 and the dev page.
   **Done:** `candidates.ts`, `score.ts`, `suggest.ts`, `tests/fixtures/closets/`,
   `tests/outfit-suggest.test.ts` and `src/app/dev/outfits+api.ts`.
3. Tag additions (layer step, collared, neckline, metal) and the re-tag flow.
   **Done:** shirt kind, neckline and metal are asked of the AI; older pieces
   get "Please check" (see "What the tags need first").
4. Fashionpedia check (Test 3), then adjust rules and weights.
   **Done:** `scripts/fashionpedia/`. H3 now allows two skipped layers and H7
   counts a matching set once. H12, S3 and S9 are left for the rule review.
5. AI step, `POST /api/outfit` and Test 4.
   **Done:** `src/server/pick-outfits.ts` and `src/app/api/outfit+api.ts`.
   The AI picks 3 from the top 10 by score; falls back to the top 3 if any
   returned index is out of range or the call fails. Test 4 is an analysis
   of `logs/ai-calls.jsonl` entries with `source: "outfit-api"`.
6. Outfit screen in the app with feedback and the wear log, then Test 5.

Steps 1 and 2 can start right away and don't depend on anything else.

## Decisions

The following were open questions after Test 3. Each decision and its code
implication is recorded here.

### Rules and scoring

**H12 (black clothing) → dropped as a hard rule.**
The black-link logic (black clothes = black shoes + black belt) is removed
from `rules.ts`. It is replaced by a new soft scoring rule in `score.ts`:
when a belt is worn, belt and shoes that do not match each other receive a
small penalty. No belt worn → no penalty. This keeps the genuine insight
(belt and shoes should coordinate) without blocking 30% of real outfits.

**S3 (shoe contrast) → sign corrected, shape changed.**
The old rule rewarded shoes that differed from the outfit colour; real data
showed people do the opposite. The new S3 in `score.ts` rewards both ends
of the spectrum: tonal matching (shoes close to the outfit's colour) and
clear contrast (shoes clearly different). Only near-miss colours — almost
matching but not quite — receive a penalty. The score is U-shaped rather
than linear.

**S9 (colour-wheel harmony) → kept at low weight.**
The data showed no signal, but the weight is already low enough that it
cannot flip a ranking on its own. It stays so that the AI-learning step
(see Explanations below) can later measure whether users' actual choices
confirm or contradict it, and the weight can be tuned or dropped then.

### Garment-specific rules (dresses, skirts, blouses)

Built before launch, in `rules.ts`, per garment type rather than as a
"womenswear" block — so they apply to anyone who wears them:

- A dress covers both a top and a bottom. The only outer layers that go over
  it are a cardigan, jacket or coat (not a T-shirt or blouse).
- A skirt pairs with the same tops as a dress bottom would.
- A blouse follows the same layering rules as a shirt but without the
  collared-shirt neckline constraint (H5).
- In winter, a dress may need tights (counted as the base layer) and a coat.

These rules are designed together with the warmth rule (see below) since
cold-weather dress outfits are where the gaps are most visible.

### Warmth rule

A soft rule that rewards outfits suited to the weather is added, but only
after user settings exist — so it can account for personal factors (someone
who tends to run cold may always want a coat). Until then, the season field
on each piece (H11) is the only weather signal.

### Weather input

Hybrid: forecast as the default (device location, asked only when the
outfit screen first opens — not at app launch), one-tap override so the
user can correct it, and calendar connection as a later opt-in. The
warmth rule and the coat-in-winter gap both feed from this input, so the
weather step and the warmth rule ship together.

### Explanations and personal style

Constrained AI: the model receives the actual scored reasons for each outfit
("navy + white proven pair", "darkest layer outside") plus any observed
patterns from the user's own choices ("you have often paired these"). It
rewrites them into one natural sentence. Because the reasons are given, the
AI cannot invent a justification that contradicts the score.

The tone is never judgmental. The app does not tell people that something
does not go together — style is personal. The rules are a starting point.
When the AI notices that a user consistently picks outfits it did not
suggest, or swaps a particular type of piece, it updates the weights of the
soft rules for that user. S9 (colour wheel) is one candidate for this
per-user tuning.

### Open (still)

- The real business casual rules from Christoph.
- Joggers for casual: sport is one formality step from casual, so gray
  joggers can appear next to an oxford. A style penalty or a stricter
  mapping may be needed.
- Polo under a blazer at a cocktail evening: passes every hard rule but
  a stylist would likely disagree. Needs Test 5 to decide.

---

## Capsule wardrobe

A capsule wardrobe is a small set of versatile pieces that combine into
many outfits. The app's data — a full scanned wardrobe, wear dates, and
the ability to enumerate every valid outfit — makes this a natural fit.

Three views, all derived from what the pipeline already computes:

**Versatility score per piece.** For each item, count how many valid
outfits (passing all hard rules, for a fixed occasion and season) it
appears in. Items that appear in many outfits are anchors; items that
appear in very few are candidates for removal or replacement.

**Rarely worn.** Already tracked via S10. Surface pieces that have not
been worn for a long time alongside how many outfits they enable, so the
user can decide whether to wear them more or let them go.

**"One new piece" suggestion.** Run the pipeline on a hypothetical
expanded closet: for each piece type and colour the user does not own,
count how many new valid outfits it would unlock. Surface the top few.
This is the sustainability argument made concrete: buy one thing that
works with what you already own rather than a collection that only works
together.

These three support the app's three core arguments:
- **Sustainability:** wear what you own more often; buy less and more
  deliberately.
- **Efficiency:** less time deciding; every suggestion is already known
  to work.
- **Optimisation:** a wardrobe where everything works with everything.
