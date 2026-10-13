# Versions and releases

Spendr uses semantic versioning, `MAJOR.MINOR.PATCH`, starting at **1.0.0**
for the public launch. Everything before that (0.x) was the beta.

The version lives in one place, `package.json`. The app reads it from there
(`src/lib/release.js`), so What's New, the changelog, the Settings footer,
bug reports and crash logs all agree.

## Which number goes up

Pick by the biggest change since the last push:

| Bump | When | Example |
|---|---|---|
| **MAJOR** (2.0.0) | People have to relearn something, a feature goes away, or a migration must run before the app works | A redesign of Home and navigation |
| **MINOR** (1.1.0) | Anything new a person can see or use | The wishlist, a new chart, a new setting |
| **PATCH** (1.0.1) | Fixes and polish only, nothing new | A wrong total, a layout glitch, clearer wording |

A MINOR resets PATCH to 0 (1.2.3 to 1.3.0), and a MAJOR resets both
(1.4.2 to 2.0.0).

## One version per push

Spendr deploys from `main` on every push, so a push is a release.

- **Don't push until the owner says so.** Work is committed locally and
  batched, so people get one update, not five in a day.
- **Bump once, at push time.** Commits between pushes share one version. If
  the batch has a feature, it's a MINOR; if it's only fixes, a PATCH.
- **Run migrations first.** If the batch adds a file to
  `supabase/migrations/`, the owner runs it in the Supabase SQL editor before
  the push.

## Release steps

1. `npm version X.Y.Z --no-git-tag-version` (updates `package.json` and the
   lockfile).
2. In `src/lib/release.js`, set `RELEASE_DATE` and write `RELEASE_NOTES`: what
   changed, in a person's words, one or two sentences each, eight at most.
   Every release has at least one note, a PATCH included.
3. In `src/lib/changelog.js`, add the previous release's notes as a static
   entry under the current one (`release.test.js` checks the order).
4. Check: `npm run check`, `npm test`, `npm run lint`, `npm run build`, and look
   at anything visual in a browser.
5. Commit as `X.Y.Z: short summary`, then push, and tag it:
   `git tag vX.Y.Z && git push origin main --tags`.

## Copy rules for release notes

- Sentence case, no em dashes (`npm run check` enforces the dashes).
- Short: a caption, not a paragraph.
- Notes stay out of What's New for now.
