# Badges — what shipped, and what you need to do

Everything is built, tested and running. The feature **works right now** without
any artwork: each badge has a drawn SVG form that is good enough to ship. The
generated images are an upgrade, not a dependency — drop them in and they take
over automatically.

Three things need you:

1. **Run the SQL** (below) in the Supabase SQL editor.
2. **Paste the ChatGPT prompt** (below) and save the image it gives you.
3. **Hand me the image** — I crop it into ten files and they appear.

Until (1), badges still work; they just stay on this device. Until (2)/(3), the
drawn versions show. Nothing is blocked on anything.

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

Paste this as-is. Ask for **one image**.

> ⚠️ Before you paste: turn on transparent background if your ChatGPT image
> tool offers it as a toggle. The prompt asks for it too, but the toggle is more
> reliable. If the result comes back on a solid colour anyway, that is fine —
> tell me and I will key it out. **Do not** ask it to add the badge names as
> text; the app draws those itself, and baked-in text would be wrong the moment
> we reword anything.

```
I need a single PNG containing 10 achievement badge icons for a mobile personal
finance app, laid out on a strict grid so I can crop them apart programmatically.

=== OUTPUT SPEC (follow exactly — this matters more than the art) ===

- ONE image, landscape, 1536 x 1024 pixels.
- TRANSPARENT background. No backdrop, no panel, no card behind the badges, no
  cast shadows onto the background. Any glow or shine must be INSIDE the badge
  silhouette.
- A 5 x 2 grid: 5 badges across, 2 rows down. Cells are 307.2 x 512 px.
- Each badge centred in its own cell, all 10 the SAME height (about 300 px
  tall), with even margins. No badge touches or overlaps another. No badge
  bleeds outside its cell.
- NO text, NO labels, NO numbers, NO captions anywhere in the image. The app
  renders the names itself.
- No frame, no border, no grid lines, no watermark.

=== DESIGN SYSTEM (match this — it is an existing app, not a new one) ===

The app is "Spendr", a Philippine personal-finance PWA. Its look is sleek,
iOS-like, calm and clean. Think Apple Wallet and iOS 17 Fitness awards rather
than a mobile game.

- SHAPE: every badge is the SAME silhouette — a modern shield / rounded pin.
  Squared shoulders with a generous 8px-scale corner radius at the top, sides
  running straight down, then tapering to a soft rounded point at the bottom
  centre. Roughly 8:9 width to height. The silhouette is what makes 10 badges
  read as one set, so it must not vary between them.
- FILL: a smooth vertical two-stop gradient, light at the top, deeper at the
  bottom. Flat colour, no texture, no noise, no grain.
- SHINE: one soft highlight sweeping across the upper third, clipped to the
  badge shape. Subtle — this is glass, not chrome. No lens flares, no sparkles,
  no starbursts, no confetti.
- GLYPH: one simple line icon centred in the badge, pure white, stroke-only
  (never filled), uniform ~2px-scale stroke weight, rounded caps and joins.
  Geometric and minimal, in the style of SF Symbols, Feather or Lucide. The
  glyph should occupy about 45% of the badge's width. Do not outline the glyph
  in a second colour, do not add a drop shadow to it.
- NO ribbons, NO laurel wreaths, NO stars around the edge, NO metallic bevels,
  NO 3D extrusion, NO skeuomorphic medal texture. Flat-with-a-gradient only.
- Every badge is rendered at the same size, same lighting, same angle. Straight
  on, no perspective, no tilt.

=== THE 10 BADGES, IN READING ORDER (left to right, top row first) ===

Row 1:
1. Gradient #5BB4FF -> #1878D4 (blue). Glyph: a coin — a circle with a peso
   sign (a "P" crossed by two short horizontal bars) inside it.
2. Gradient #A084FA -> #6741D9 (violet). Glyph: a simple flame.
3. Gradient #A9B6C7 -> #64748B (cool grey). Glyph: three stacked layers /
   diamonds, like a layers icon.
4. Gradient #74DD86 -> #2F9E44 (green). Glyph: a speedometer / gauge — a
   half-circle arc with a short needle pointing to the lower left.
5. Gradient #49DBB4 -> #0CA678 (teal). Glyph: a rising zigzag trend line with a
   small arrowhead at its top right.

Row 2:
6. Gradient #FFC978 -> #F08C00 (amber). Glyph: a pennant flag on a vertical
   pole, with a deep V notch cut into the flying edge.
7. Gradient #F888AE -> #D6336C (rose). Glyph: a checkmark inside a circle.
8. Gradient #8199FB -> #3B5BDB (indigo). Glyph: two arrows chasing each other
   in a loop, like a repeat / recurring icon.
9. Gradient #4BCEDF -> #0B7285 (cyan). Glyph: two overlapping payment cards
   (rounded rectangles), the front one with a magnetic stripe line.
10. Gradient #FDD64B -> #E67700 (gold). Glyph: a simple five-point crown.

Render all 10 in one image on the 5x2 grid described above, transparent
background, no text.
```

### If the result is not quite right

Ask for a regeneration rather than an edit — editing tends to drift the
silhouette, and the silhouette is the thing that makes them a set.

- **Badges are different sizes** → "Regenerate. All 10 badges must be exactly
  the same height and centred in equal cells."
- **It added names under each badge** → "Regenerate with absolutely no text."
- **It drew medals with ribbons** → "Regenerate. No ribbons, no laurels, no
  metal. Flat shield shape with a gradient fill only."
- **The background is white, not transparent** → send it anyway, I will key it.

---

## 4. What to do when you wake up

1. Run the SQL above. (2 minutes)
2. Paste the prompt into ChatGPT, ask for the image, download the PNG.
3. Save it anywhere and tell me the path. I will:
   - crop it into 10 files at `src/assets/badges/<key>.png`
   - verify each one lands on the right badge
   - check them at 62px (the grid) and 104px (the detail sheet), light and dark

The filenames I will use — this is also the order they appear in the prompt, so
cell 1 is `first-peso` and cell 10 is `six-figures`:

```
first-peso   seven-days   century      under-budget  green-month
goal-funded  debt-cleared on-autopilot diversified   six-figures
```

**No code changes are needed when the art lands.** `BadgeMark` picks up anything
in `src/assets/badges/` at build time via `import.meta.glob`, keyed by filename.
A badge with a file uses it; a badge without keeps its drawn form. The two can
coexist, so a partial set is fine.

---

## 5. Where everything is

| File | What it holds |
|------|---------------|
| `src/lib/badges.js` | The 10 definitions and what earns each one. **Edit copy here.** |
| `src/lib/badges.test.js` | 26 tests pinning the lines above — the month rules, the streak, the credit exclusion |
| `src/hooks/useBadges.js` | Reads the tables, awards as a side effect, never un-awards |
| `src/components/BadgeMark.jsx` | The artwork: the PNG if present, the drawn shield if not |
| `src/components/BadgeChip.jsx` | The shield-shaped button in the dashboard header |
| `src/pages/Badges.jsx` | The page at `/badges` |
| `src/db/db.js` (v10) | The local `badges` table |
| `src/lib/sync.js` | `badgeToRow`, `pullBadges`, and the two `optionalSync` calls |
| `src/supabase/migrations/006_badges.sql` | The SQL above, with its reasoning |

### UI decisions you may want to overrule

- **The header chip is not a circle**, per your ask. It is a shield wearing
  `IconButton`'s exact surface paint (see `.badge-chip-face` in `index.css`), at
  the same 36px, on the same baseline as the settings gear. Same material,
  different silhouette — which is how you can tell at a glance that it does not
  open another list of switches.
- **It shows the earned count inside it.** A shield with nothing in it is
  decoration and gets ignored; the number is the reason to tap. It shows `0` on
  a fresh install rather than hiding, because a new user is exactly who the
  invitation is for.
- **Locked badges show their real shape, greyed** — not question marks. A hidden
  badge is one nobody can work toward, and tapping a locked one says exactly how
  it is earned. Nothing here is a secret.
- **There is no toast, no confetti, no "badge unlocked!" interruption.** Badges
  land quietly and the count on the header goes up. If you want a celebration on
  earning one, say so — it is a small addition, but it is the kind of thing that
  gets annoying on the fourth time, so I left it out.
- **Badges are also in Settings → Manage**, for the person who opened Settings to
  see what the app has in it.

### Gate

eslint clean · 143 files scope-checked · 361 tests · `vite build` · verified in
the browser at 390×844 in both themes.
