# Brand logos (optional, not committed)

Drop an SVG here named after the brand key and the account card will use it as
its bottom-right watermark instead of the built-in category glyph. No code
change is needed — `BrandWatermark` picks the folder up at build time.

    gcash.svg   maya.svg   maya-savings.svg   gotyme.svg   maribank.svg
    metrobank.svg   bpi.svg   maya-credit.svg   spaylater.svg   cash.svg

The keys are whatever `accountBrand()` in `src/lib/accountBrands.js` returns,
so `Maya Savings` resolves to `maya-savings.svg`.

Notes worth knowing before you add any:

- Whatever you drop in is flattened to flat white by CSS and rendered at ~10%
  opacity. A watermark wants one silhouette, so a full-colour file still works
  — its palette simply will not show.
- Prefer a single-path, monochrome mark over a full lockup with text. At 10%
  opacity and clipped by two card edges, wordmarks turn to mud.
- Nothing is committed here on purpose. There is no licensed source for
  Philippine bank card art, and Settings states this app is unaffiliated with
  these institutions and uses their names only as labels; shipping their
  trademarks would contradict that. Adding files to your own build is your
  call, and this is the seam for it.
