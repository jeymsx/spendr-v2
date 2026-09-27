# Achievements: what shipped, and what you need to do

Badges grew into **achievements**: challenges, milestones and badges under one
roof, drawn as 3D glass medallions instead of the old PNG artwork, with a
full-screen moment and a shareable 9:16 picture when you earn one.

**One thing to do:** run `src/supabase/migrations/021_challenges.sql` in the
Supabase SQL editor before (or right after) deploying. Until it is applied,
challenges stay on the device they were started on; everything else syncs as
before. Milestones need nothing new: they are rows in `badges` (006).

---

## 1. The model

| Kind | What it is | Stored |
| --- | --- | --- |
| **Milestone** | A level on a track that keeps going: 3, 7, 14, 30… days | `badges` (006), one key per level |
| **Badge** | A one-off: settling a debt, four kinds of account | `badges` (006) |
| **Challenge** | Something you choose, for a set window. Won or missed, then yours to try again | `challenges` (021), one row per attempt |

The rule from the original badges still holds for all three: each one is about
your money, and the app proves it from the ledger rather than taking your word
for it.

### The eight tracks (43 levels)

| Track | Levels |
| --- | --- |
| Logging streak | 3 · **7** · 14 · **30** · 60 · 100 · 180 · 365 days |
| No-spend streak | 3 · **7** · 14 · 30 · 60 · 100 days |
| Entries logged | **1** · 50 · **100** · 250 · **500** · 1K · 2.5K · 5K |
| Green months | **1** · **3** · 6 · 12 in a row |
| On budget | **1** · **3** · 6 · 12 in a row |
| Money held | **100K** · 250K · 500K · **1M** · 2.5M |
| Goals funded | **1** · **3** · 5 at once |
| Challenges won | 1 · 3 · 5 · 10 · 25 |

The **bold** levels are seven of the original twenty badges, which were already
harder versions of each other (Seven Days then Thirty Days, Century then Five
Hundred). They kept their keys, so nothing already earned moved.

### The fifteen badges

Debt Cleared, On Autopilot, Diversified, Year One, Rainy Day and Debt Free from
the original set, plus two that came with achievements: **Limits Set** (a
monthly limit on three categories) and **Something to Save For** (a first
savings goal). And seven more (0.8.0):

| Badge | Earned by |
| --- | --- |
| **Pay Yourself First** | A transfer into a savings account from one that isn't |
| **Half Kept** | A finished month with spending at most half of what came in |
| **A Lighter Month** | A finished month at least 10% under the one before, with 15+ days logged |
| **Money Back** | A refund logged against a purchase |
| **Fair Share** | A purchase split with someone, so they owe you their share |
| **All Squared** | Someone paying back everything they owed you |
| **Worldly** | Money held in accounts of two currencies (credit cards and empty accounts don't count) |

The two month badges wait for the month to end, as the month tracks do, so a
month still running can't earn one and then take it back. Like every badge
they are rows in `badges` (006), keyed by name: **no SQL** for any of them.

### The eight challenges (three at a time)

No-Spend Day · No-Spend Weekend · Five Quiet Days (5 in 14) · Seven Straight
(log every day for a week) · Category Cap (a week under a cap you pick) · Less
Than Last Week · Keep Some Back (end the month with an amount kept) · Inside
Every Limit (a month inside every budget).

## 2. The rules that keep it honest

- **A quiet day has to be vouched for.** A day with no expenses looks exactly
  like a day you never opened the app. It counts only if Spendr was open that
  day or the next, or anything was logged on it. The app keeps a record of the
  days it was open (`activeDays` in meta, on the device).
- **A day settles once the day after it is over.** Yesterday's lunch often gets
  logged this morning. So a no-spend level, a challenge win, and a green or
  on-budget month all wait for their day after. A streak still *shows*
  yesterday; the level waits.
- **Won when it's certain, missed when it's certain.** A cap is missed the
  moment it goes over (scheduled installments count). A reach challenge is won
  the moment it gets there, on settled days.
- **Never on a ledger that hasn't caught up.** Signed in, nothing is awarded
  while a sync runs, and no challenge is judged until a sync has finished this
  session. Otherwise a laptop opened after three days could call a running
  challenge lost, and that verdict would win against every other device.
- **Quiet when history arrives.** The first run of this version, a sign-in
  that pulls an account down, a restore and an import each satisfy many levels
  at once, and none were just earned. Those are written silently. Everything
  else celebrates, including levels that moved while the app was closed.
- **One moment per track.** Reaching three levels of a track at once is one
  celebration, at the highest.
- **On budget counts only months since there were limits.** Two generous limits
  set today must not award a year of months at once.

## 3. The SQL

`021_challenges.sql` creates one table with row-level security (own rows only),
the unique index the sync upserts on, and a deletion trigger. It needs 014 (the
deletions log) already applied, for the trigger's function. It touches no
existing table and is safe to run twice. The file ends with a read-only query
that checks it applied.

## 4. The glass

`src/components/glass/glass.js` draws every picture and medallion as SVG from
one hue: a solid shape set back, a frosted pane in front with the solid blurred
through it, a light rim and a mark pressed in. The same SVG renders inline
(animated), as an `<img>`, and into a canvas for the share pictures.

- **Medallions:** hexagon = badge, circle with a level chip = milestone,
  shield = challenge. Locked ones are the same shape in grey glass.
- **Wrapped** uses the same pictures in place of the Fluent emoji: gift, coin,
  piggy, rocket, target and the rest, tinted to the month's colour.
- **Animation:** the back solid, the pane and the mark arrive staggered, then
  a slow float and a light sweep. All of it is off under reduced motion.

## 5. The moment

Earning something opens a full screen: the achievement's colour washing down,
turning rays, drifting confetti, the medallion flipping in, and a burst when it
lands. The buttons are **Share** (iPhone), **Save** and **Share** (Android), or
**Save image** (desktop), plus **Back to Home**. The picture is 1080×1920 with
the Spendr mark and name, drawn as the screen opens because an iPhone only
opens the share sheet inside the tap. Tapping any medallion on the page opens
the same screen to look at it, or share it, again.

## 6. Clean style and Lights out

Settings now has one **Preferences** row, opening a page with Appearance (light
or dark, Vivid or Clean, accent) and Behaviour. **Clean** is flat, neutral
surfaces with hairline edges: no accent glow, no tinted glass, a plain panel for
the net-worth wallet. In dark mode it is **Lights out**: true black. It lives in
one CSS layer (`html.flat` in `index.css`), applied before first paint from
`index.html`. On desktop it is a switch in Settings → Appearance.

## 7. Where everything is

| File | What it holds |
| --- | --- |
| `src/lib/achievements.js` | Tracks, badges, streaks, evaluation. **Edit copy here.** |
| `src/lib/challenges.js` | The challenges: plan, judge, windows, settling |
| `src/lib/badges.js` | The original twenty's definitions, still used for the six one-offs |
| `src/context/AchievementContext.jsx` | Awards, judges, queues moments. Mounted in both layouts |
| `src/hooks/useSyncState.js` | Whether a sync is running or has finished this session |
| `src/components/glass/` | The glass engine and its React component |
| `src/components/achievements/` | The full-screen moment, its picture, and the queue |
| `src/pages/Achievements.jsx`, `src/pages/achievements/` | The page: streaks, challenges, milestones, badges |
| `src/pages/settings/Preferences.jsx` | Appearance and behaviour |
| `src/db/db.js` (v13) | The local `challenges` table |
| `src/lib/sync.js` | `challengeToRow`, `rowToChallenge`, and their `optionalSync` calls |
| `src/supabase/migrations/021_challenges.sql` | The SQL above, with its reasoning |

## 8. Decisions you may want to overrule

- **No streak chip on Home.** The bell took the trophy's place in the header
  earlier, and a third control would crowd the greeting on a small phone. The
  page is in Settings, and every level and win leaves a notification that links
  to it.
- **Scheduled installment payments count as spending** on no-spend days, and a
  challenge is never planned on a day that already has one.
- **A month-long challenge needs every day vouched for.** Open the app at least
  every other day, or log what you spent on the days you did not.
- **Titles drop the closer when the name already says it:** "3 Challenges Won."
  rather than "3 Challenges Won Reached."
