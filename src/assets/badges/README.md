# Badge artwork

Drop the cropped PNGs here, named for the badge's `key` in `src/lib/badges.js`:

```
first-peso.png   seven-days.png   century.png      under-budget.png  green-month.png
goal-funded.png  debt-cleared.png on-autopilot.png diversified.png   six-figures.png
```

That is the whole installation step. `BadgeMark` picks up anything in this
folder at build time through `import.meta.glob`, keyed by filename - there is no
manifest to update and no flag to flip.

A badge with no file here keeps its drawn SVG form, so a partial set is fine and
the two can coexist indefinitely.

Transparent background, roughly 300px tall, 8:9-ish. See `BADGES.md` at the repo
root for the prompt that generates them.
