# Badges — what shipped, and what you need to do

Built, tested, running, **and the artwork is in.** All ten rendered badges are
cropped, masked to their own outline and living in `src/assets/badges/`.

**One thing still needs you: run the SQL in §2.** That is it. Until you do,
badges work exactly as they do now — they just stay on this device instead of
syncing.

§3 keeps the prompt that produced the art, and §3b regenerates any single badge
at full size if you ever want to redo one.

---

## 1. The ten badges

I picked these against one rule: **a badge has to be about your money, not
about the app.** No points for opening Spendr, no streak for tapping around.
Every one is provable from what is already in the ledger, which also means they
all work offline.

| # | Badge | Earned by | Why it made the list |
|---|-------|-----------|----------------------|
| 1 | **First Peso** | Your first transaction | The one that has to exist. It fires on the action that makes the app useful. |
| 2 | **Seven Days** | Logging on 7 consecutive days | The habit. Days are de-duplicated, so five coffees on one day is one day. |
| 3 | **Century** | 100 transactions | Volume, and the only pure-count badge. |
| 4 | **Under Budget** | Finish a calendar month inside every category limit | The hardest one, and the one worth the most. |
| 5 | **Green Month** | Finish a month with inflow above expenses | Says something a single number never can. |
| 6 | **Goal Funded** | Any savings goal hits its target | Reads the same allocator the Goals page draws, so they can never disagree. |
| 7 | **Debt Cleared** | Settle a debt to zero | Finishing something. |
| 8 | **On Autopilot** | Three active recurring bills | Rewards setting the app up properly. |
| 9 | **Diversified** | Accounts of four different kinds | Counts *kinds*, not accounts — four banks is still one kind. |
| 10 | **Six Figures** | ₱100,000 across your accounts | Credit is excluded: a credit line is not money you hold. |

Three judgement calls worth knowing about, because they are the ones you might
disagree with:

- **Badges 4 and 5 ignore the month in progress.** A "green month" awarded on
  the 3rd, before rent comes out, is a badge that lies for four weeks and then
  has to be taken back.
- **Under Budget needs at least two budgeted categories**, or you could earn it
  by setting one limit on something you never buy.
- **Once earned, always earned.** Edit a goal upward after funding it, re-open a
  debt, spend the ₱100K — the badge stays. It records that you did the thing on
  the day you did it.

---

## 2. The SQL — run this first

Supabase → SQL Editor → new query → paste → Run.

It creates **one new table** and touches nothing else. No `ALTER` on an existing
table, no `DROP`, no data migration. Safe against your live database.

> The editor will flag it as "potentially destructive" because it contains
> `alter table … enable row level security`. That is a plain keyword scan, not a
> real finding — enabling RLS has no other syntax, and leaving it off would
> expose every user's rows to anyone holding the anon key (which ships in the
> bundle by design). The full file is at
> `src/supabase/migrations/006_badges.sql` with the reasoning inline.

```sql
create table if not exists public.badges (
  id      uuid not null default gen_random_uuid (),
  user_id uuid not null,

  -- The badge's definition key: 'first-peso', 'green-month', 'six-figures'.
  -- No local_id, unlike every other table: the key IS the identity, it is the
  -- primary key in IndexedDB too, it is stable across devices, and it survives
  -- a local database reset (an autoincrement id does not — the counter does
  -- not rewind on table.clear()).
  key text not null,

  -- When it was earned. The one fact the client cannot recompute.
  -- timestamptz, not text: unlike transaction_date this is an instant rather
  -- than a calendar day, and it is only ever formatted for display.
  earned_at  timestamp with time zone null default now(),
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null,

  constraint badges_pkey primary key (id),
  -- The upsert conflict target. Without it the push fails outright: Postgres
  -- has nothing to resolve ON CONFLICT against.
  constraint badges_user_id_key_key unique (user_id, key),
  constraint badges_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
);

create index if not exists badges_user_id_idx on public.badges (user_id);

alter table public.badges enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'badges'
      and policyname = 'badges: own rows only'
  ) then
    create policy "badges: own rows only"
      ON public.badges FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  end if;
end $$;
```

**How to check it worked:** sign in, pull to sync, then `select key, earned_at
from badges;` in the SQL editor. You should see one row per earned badge.

**If you do not run it:** `lib/sync.js` steps over the badges push and pull the
same way it does for goals. Everything else keeps syncing. Badges stay on the
device.

**Merge rule when two devices disagree about the date:** the earlier one wins.
You did the thing on the day you did it; syncing a second device later must not
re-date it.

---

## 3. The ChatGPT prompt

This is the glassy 3D gem style from your references — a translucent hexagon
with an inner frame, a big diagonal glass reflection, and the glyph rendered as
a **faceted object in the badge's own colour**, not a flat white line icon.

Ask for **one image**. Turn on transparent background if your tool offers it as
a toggle; the prompt asks too, but the toggle is more reliable.

> **One honest caveat before you paste.** This style is detail-heavy — the
> references you sent are single 1024×1024 renders. Ten of them on one sheet
> means each is about 300px, and the facets and sparkles will be softer than
> the references. Try the sheet first, because it is one generation and one
> crop. If any badge comes back mushy, **§3b** regenerates just that one at full
> size and I will drop it in over the sheet version.

```
Create ONE image containing 10 achievement badge icons for a mobile personal
finance app, laid out on a strict grid so I can crop them apart.

=== OUTPUT SPEC (follow exactly — this matters more than the art) ===

- ONE image, landscape, 1536 x 1024 pixels.
- TRANSPARENT background. No backdrop, no panel, no card, no scene. No shadow
  cast onto the background. Every glow and reflection must sit INSIDE the badge
  silhouette.
- A 5 x 2 grid: 5 badges across, 2 rows down, cells of 307 x 512 px.
- Each badge centred in its own cell, all 10 exactly the SAME size (about 290 px
  wide), even margins. No badge touches, overlaps, or bleeds out of its cell.
- NO text, NO labels, NO numbers, NO captions. The app draws the names itself.
- No frame, no border, no grid lines, no watermark.

=== THE STYLE ===

Modern 3D glassmorphism achievement badges — glossy, translucent, gem-like.
Think mobile game reward badges and Duolingo/Poe achievement art: soft, candy,
premium. Vector-smooth, NOT photorealistic, NOT clay, NOT metal, NOT pixel art.

Every badge is built the same way, and this structure must not vary:

1. SHAPE: a hexagon, flat top and bottom edges with points at left and right,
   with softly rounded corners. Slightly taller than wide.
2. OUTER FRAME: a wide translucent border of the badge's colour, lighter and
   more transparent than the middle — like frosted glass. It reads as a thick
   rim around the badge.
3. INNER FRAME: a thin bright hairline hexagon just inside the outer frame,
   following the same shape, like the bevelled edge of a piece of glass.
4. FACE: the recessed centre panel, a smooth gradient of the badge's colour —
   lighter at the top-left, deeper and more saturated at the bottom-right.
5. GLASS REFLECTION: one large hard-edged diagonal running from the upper-left
   down to the lower-right across the WHOLE badge. Everything above-left of that
   line is brighter and glassier; everything below-right is slightly deeper in
   tone. This single diagonal is the most important thing in the style — it is
   what makes the badge look like glass instead of a coloured sticker.
6. SPARKLES: two or three tiny white four-point sparkles (different sizes)
   scattered inside the face, near the glyph. Small and sparse.

=== THE GLYPH — READ THIS TWICE ===

The icon in the middle is NOT a flat white line icon and NOT an outline. It is a
small three-dimensional OBJECT that appears to be carved from the same glassy
material as the badge, sitting on the face and catching the same light.

- It is in the SAME COLOUR FAMILY as the badge, several shades LIGHTER — a
  cream or pale tint of that hue, so it reads as the same material lit from
  above. Not white, not grey, not a contrasting colour.
- It has FACETS and internal shading: a bright top-left surface, a mid tone, and
  a deeper shadow side, like a cut gem or a smooth 3D render.
- It is SOLID and filled, with soft rounded edges. No outlines, no stroke, no
  drop shadow.
- It occupies roughly 45% of the badge's width, centred on the face.

=== THE 10 BADGES, IN READING ORDER (left to right, top row first) ===

Row 1:
1. BLUE (#5BB4FF light → #1878D4 deep). Object: a thick 3D coin seen face-on,
   with a peso sign (a letter P crossed by two short horizontal bars) embossed
   into it. Pale ice-blue coin on a blue badge.
2. VIOLET (#A084FA → #6741D9). Object: a smooth 3D flame with a rounded teardrop
   body and a curled tip. Pale lilac flame on a violet badge.
3. COOL GREY (#A9B6C7 → #64748B). Object: three faceted diamond-shaped slabs
   stacked with a small gap between them, like layers. Pale silver on grey.
4. GREEN (#74DD86 → #2F9E44). Object: a 3D speedometer dial — a thick half-ring
   arc with a short chunky needle pointing to the lower left and a small round
   hub. Pale mint on green.
5. TEAL (#49DBB4 → #0CA678). Object: a thick 3D arrow rising steeply to the
   upper right, with a solid triangular arrowhead. Pale aqua on teal.

Row 2:
6. AMBER (#FFC978 → #F08C00). Object: a 3D pennant flag on a rounded pole, the
   flag with a deep V notch cut into its flying edge. Pale cream on amber.
7. ROSE (#F888AE → #D6336C). Object: a thick 3D checkmark with rounded ends,
   inside a soft ring. Pale blush on rose.
8. INDIGO (#8199FB → #3B5BDB). Object: two chunky 3D arrows curving around each
   other into a closed circle, like a refresh symbol, each with a solid
   arrowhead. Pale periwinkle on indigo.
9. CYAN (#4BCEDF → #0B7285). Object: two rounded 3D payment cards overlapping,
   the front one slightly tilted with a raised stripe across it. Pale ice on
   cyan.
10. GOLD (#FDD64B → #E67700). Object: a faceted 3D crown with five points, each
    point tipped with a small round bead. Pale champagne on gold.

Render all 10 in one image on the 5x2 grid described above. Transparent
background. No text anywhere.
```

### 3b. Regenerating a single badge at full size

If one comes back soft, use this for just that badge. It produces a single
1024×1024 render at the same detail as your reference images.

```
Create ONE 1024 x 1024 image: a single 3D glassmorphism achievement badge,
centred, on a fully TRANSPARENT background. No text, no shadow on the
background, nothing else in the frame.

Style: modern glassy gem achievement badge — glossy, translucent, premium,
vector-smooth (not photorealistic, not metal, not clay).

Structure, in layers:
- A hexagon with flat top and bottom edges, points at left and right, softly
  rounded corners, slightly taller than wide. It fills about 85% of the canvas.
- A wide translucent frosted-glass rim in the badge colour, lighter and more
  transparent than the centre.
- A thin bright hairline hexagon just inside that rim, like a bevelled glass
  edge.
- A recessed centre face: smooth gradient, lighter at the top-left, deeper and
  more saturated at the bottom-right.
- ONE large hard-edged diagonal glass reflection running from the upper-left to
  the lower-right across the whole badge. Above-left of the line is brighter and
  glassier; below-right is deeper. This is the defining feature of the style.
- Two or three tiny white four-point sparkles of different sizes, scattered
  inside the face near the object.

The object in the middle is NOT a flat icon and NOT an outline. It is a small
3D object that looks carved from the same glassy material as the badge: the
SAME colour family, several shades LIGHTER (a cream or pale tint of that hue),
with visible facets and internal shading — a bright top-left surface, a mid
tone, a deeper shadow side. Solid and filled, soft rounded edges, no stroke, no
drop shadow. It occupies about 45% of the badge's width.

BADGE COLOUR: <light hex> at the top-left fading to <deep hex> at the
bottom-right.
OBJECT: <the object description from the list>
```

Fill in the two hexes and the object line from the list in §3 above.

### If the result is not quite right

Regenerate rather than asking for an edit — edits tend to drift the silhouette,
and the silhouette is the thing that makes ten badges read as one set.

| What went wrong | What to say |
|---|---|
| The glyph came out flat white | "The centre object must be a 3D faceted object in a LIGHTER SHADE OF THE BADGE'S OWN COLOUR, not white and not an outline icon." |
| Badges are different sizes | "Regenerate. All 10 badges exactly the same size, centred in equal cells." |
| It added the badge names | "Regenerate with absolutely no text anywhere." |
| It looks like metal or clay | "Regenerate: translucent glass and gem, vector-smooth, not metallic, not clay, not photorealistic." |
| No diagonal reflection | "Add one large hard-edged diagonal glass reflection from upper-left to lower-right across the whole badge." |
| The background is white, not transparent | Send it anyway — I will key it out. |

---

## 4. What to do when you wake up

**Run the SQL in §2.** Two minutes in the Supabase SQL editor. Nothing else is
outstanding.

### How the art got in, in case you redo it

The sheet came back on a dark bloom rather than a transparent background, so
each badge was cut out from its own edges rather than with a hand-drawn mask:
the badge has a hard boundary and the bloom is smooth, so thresholding the edge
magnitude and taking each row's and column's span between the first and last
strong edge describes the hexagon exactly — including its real rounded tips,
which a hand-built polygon kept clipping.

The crop window is 296 x 348, not square: the columns are only 300 apart, so
anything wider drags the neighbouring badge's edge into the mask. Files land at
320 x 320, quantised to 255 colours — 321 KB for all ten, and no banding, since
each badge is a single hue family.

Filenames are the badge keys, in the prompt's reading order:

```
first-peso   seven-days   century      under-budget  green-month
goal-funded  debt-cleared on-autopilot diversified   six-figures
```

**No code change is needed to swap any of them.** `BadgeMark` picks up whatever
is in `src/assets/badges/` at build time through `import.meta.glob`, keyed by
filename. A badge with a file uses it; one without falls back to its drawn
hexagon, so a partial set is fine.

---

## 5. Where everything is

| File | What it holds |
|------|---------------|
| `src/lib/badges.js` | The 10 definitions and what earns each one. **Edit copy here.** |
| `src/lib/badges.test.js` | 26 tests pinning the lines above — the month rules, the streak, the credit exclusion |
| `src/context/BadgeContext.jsx` | Reads the tables, awards as a side effect, never un-awards, queues celebrations |
| `src/components/BadgeMark.jsx` | The artwork: the PNG if present, the drawn hexagon if not |
| `src/components/BadgeChip.jsx` | The hexagon button in the dashboard header |
| `src/components/BadgeCard.jsx` | The centred card: the flip, the sway, the shine, the burst |
| `src/components/BadgeUnlocked.jsx` | The unlock queue, feeding that card |
| `src/components/Confetti.jsx` | Both bursts — falling, and thrown outward from a point |
| `src/assets/badges/` | The ten rendered PNGs |
| `src/pages/Badges.jsx` | The page at `/badges` |
| `src/db/db.js` (v10) | The local `badges` table |
| `src/lib/sync.js` | `badgeToRow`, `pullBadges`, and the two `optionalSync` calls |
| `src/supabase/migrations/006_badges.sql` | The SQL above, with its reasoning |

### UI decisions you may want to overrule

- **The header chip is not a circle**, per your ask. It is the same hexagon the
  badges wear, in `IconButton`'s exact surface paint (see `.badge-chip-face` in
  `index.css`), at the same 36px on the same baseline as the settings gear. Same
  material, different silhouette — which is how you can tell at a glance that it
  does not open another list of switches.
- **It shows the earned count inside it.** A hexagon with nothing in it is
  decoration and gets ignored; the number is the reason to tap. It shows `0` on
  a fresh install rather than hiding, because a new user is exactly who the
  invitation is for.
- **Locked badges show their real shape, greyed** — not question marks. A hidden
  badge is one nobody can work toward, and tapping a locked one says exactly how
  it is earned. Nothing here is a secret.
- **The drawn fallback is still there**, a hexagon with a rim, a raised inner
  face and a gloss wedge, its glyph a pale tint of the badge's own hue rather
  than white. Nothing renders it now that all ten have art — it is what an
  eleventh badge would wear until you generated one for it.
- **Earning one shows a centred card**, not a bottom sheet: the badge flips
  face-up, confetti bursts *out of the badge*, and it then settles into a slow
  left-right tilt while a highlight sweeps across it. It is centred because
  every other overlay in the app is a sheet, and a sheet is for doing a task —
  this is a reward with one button, and it wants to be looked at.
- **The badge is a button.** Tapping it presses in and throws the confetti
  again. It changes nothing and the card works untouched, but the badge is the
  one thing on that card anybody actually wants to touch.
- **The idle animation is a tilt, not a spin.** A looping full turn would read
  as the badge arriving again every few seconds, which undoes the one moment the
  entrance flip exists to create.
- **Tapping a badge on the badges page opens the same card**, not a sheet of
  its own — with the earned date as its eyebrow instead of "Badge unlocked". A
  badge that looked like one object when you earned it and a different one when
  you came back to look at it would read as two different badges. Locked badges
  open it too, without the confetti or the shine: there is nothing to celebrate
  about one you have not earned.
- **The card is opaque in light and translucent in dark.** On a light scrim
  there is nothing to be translucent against — the page behind is nearly the
  same value, so transparency only muddies the text. On dark it earns its keep,
  and the backdrop blur, not the fill, is what carries legibility.
- **It only fires for badges earned in front of you.** The provider writes the
  first settled evaluation silently: opening the app on a ledger that already
  qualifies — a fresh install after a sync pull, or the first run of this
  feature against months of history — satisfies several at once and none of them
  were just earned. Six cards stacked up on launch is the failure mode that
  guard exists to prevent.
- **One card at a time**, from a queue. Two at once would stack and the tap
  meant for the first would dismiss the second.
- **All of it is off under `prefers-reduced-motion`** — the flip, the burst and
  the shine. A spinning object, forty fast-moving particles and a repeating
  specular sweep is close to the worst case for anyone who set that, and none of
  it carries meaning the card does not also say in words.
- **Badges are also in Settings → Manage**, for the person who opened Settings to
  see what the app has in it.

### Gate

eslint clean · 143 files scope-checked · 361 tests · `vite build` · verified in
the browser at 390×844 in both themes.
