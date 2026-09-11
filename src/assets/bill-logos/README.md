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

Meralco, Maynilad, Globe, PLDT, Converge, Cignal and the rest are **not in
simple-icons and are not here**, for the reason `brand-logos/README.md`
gives about bank art: there is no licensed source for them, Settings states
this app is unaffiliated with these companies and uses their names only as
labels, and shipping their trademarks would contradict that.

This folder is the seam. A bill whose name resolves to no file keeps its
category glyph, which is what Meralco and Maynilad look like today — so
adding `meralco.svg` to your own build is a one-file change with nothing
else to touch. Add an alias in `src/lib/billBrands.js` if the name you use
is not the slug.

## Adding one

1. Get a monochrome SVG of the logomark — not the full lockup with text. At
   20px in a 40px chip, a wordmark is mud.
2. Strip `<style>` blocks and `class` attributes. These are inlined into the
   document, so a `<style>` inside one leaks globally.
3. Remove `fill`/`stroke` so `currentColor` can drive it.
4. Crop the `viewBox` to the mark if the file ships as a wide lockup.
5. Add the brand's hex to `BILL_BRAND_COLORS` in `src/lib/billBrands.js`.
6. Record where it came from and under what licence in `../ATTRIBUTION.md`.
