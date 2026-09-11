# Bill brand marks

Drop an SVG here named after the slug `billBrandKey()` returns and the bill
row will use it instead of the category glyph. No code change is needed —
`BillMark` picks the folder up at build time, the same way `BrandWatermark`
does for account cards.

    netflix.svg   spotify.svg   youtube.svg   icloud.svg   meralco.svg

## What is committed, and why only some of it

The 25 files here come from [simple-icons](https://github.com/simple-icons/simple-icons),
**CC0 1.0** — the same source and licence as the card-network marks in
`scheme-logos/`. See `../ATTRIBUTION.md`.

They are stored as shipped apart from three removals: `<title>` (the bill's
own name is rendered right beside the mark, so announcing the brand twice is
noise), `role="img"`, and any unused `xmlns:xlink`. The paths are untouched.
No paint is added — `.bill-mark` in index.css fills them with `currentColor`,
which `BillMark` sets to the brand's own hex.

## Philippine utilities

`meralco.svg` is here now, from [PHLogos](https://phlogos.com/) — PayMongo's
free logo library, MIT-licensed. That answers the "no licensed source" half
of the objection; the trademark half is unchanged and is the same position
every other mark here sits in (see `../ATTRIBUTION.md`).

**The rest of that library did not survive the 40px chip**, which is worth
recording so nobody re-downloads them hoping:

| brand | in PHLogos | why not |
|---|---|---|
| Meralco | yes | **shipped** — cropped to the spark, wordmark dropped |
| Globe | yes | 274KB, 916 paths, 606 fills — a mesh illustration |
| PLDT | yes | 3.5:1 wordmark |
| Smart | yes | 3.7:1 wordmark |
| Maynilad, Converge, Cignal | no | not in the library |

This folder is still the seam. A bill whose name resolves to no file keeps
its category glyph, which is what Maynilad and Globe look like today. Add an
alias in `src/lib/billBrands.js` if the name you use is not the slug.

## Adding one

1. Get a monochrome SVG of the logomark — not the full lockup with text. At
   20px in a 40px chip, a wordmark is mud.
2. Strip `<style>` blocks and `class` attributes. These are inlined into the
   document, so a `<style>` inside one leaks globally.
3. Remove `fill`/`stroke` so `currentColor` can drive it.
4. Crop the `viewBox` to the mark if the file ships as a wide lockup.
5. Add the brand's hex to `BILL_BRAND_COLORS` in `src/lib/billBrands.js`.
6. Record where it came from and under what licence in `../ATTRIBUTION.md`.
