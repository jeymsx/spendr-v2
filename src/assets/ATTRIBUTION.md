# Third-party marks

Institution and card-network marks used on the account cards. Each was
downloaded from the source below and then reduced to a monochrome silhouette:
`<style>` blocks and `class` attributes stripped (inline SVG is part of the
HTML document, so a `<style>` inside one leaks globally), all paint attributes
removed so a single CSS rule renders them white, and editor metadata dropped.

Several were also **cropped to their logomark** by rewriting `viewBox` — the
paths are untouched, the box just frames a different part of them. These files
ship as wide lockups (GCash 4.25:1, Metrobank 5:1) and a lockup rendered as a
corner watermark is an illegible sliver whatever size you give it. BPI needed
the opposite treatment: its crest inked only 32% of a page-sized 792×612 box,
so the box was tightened onto the ink.

| File | Original `viewBox` | Cropped to | Why |
|---|---|---|---|
| `gcash.svg` | `0 0 1792 422` | `-16 -19 539 461` | logomark only, wordmark framed out |
| `metrobank.svg` | `0 0 1280 256` | `8 8 247 245` | logomark only, wordmark framed out |
| `bpi.svg` | `0 0 792 612` | `81 157 631 297` | dead margin removed |

## Card networks — `scheme-logos/`

From [simple-icons](https://github.com/simple-icons/simple-icons), **CC0 1.0**
(the icons; the repo's code is MIT).

| File | Brand |
|---|---|
| `visa.svg` | Visa |
| `mastercard.svg` | Mastercard |
| `amex.svg` | American Express |
| `jcb.svg` | JCB |

## Institutions — `brand-logos/`

| File | Source | Licence |
|---|---|---|
| `gcash.svg` | Wikimedia Commons, *GCash logo.svg* | Public domain |
| `gotyme.svg` | Wikimedia Commons, *GoTyme Bank logo.svg* | Public domain |
| `metrobank.svg` | Wikimedia Commons, *Metropolitan Bank and Trust Company.svg* | Public domain |
| `maya.svg` | Wikimedia Commons, *Maya logo.svg* | **CC BY 4.0** |
| `bpi.svg` | Wikimedia Commons, *Official BPI Logo.svg* | **CC BY 4.0** |
| `spaylater.svg` | simple-icons, *Shopee* | CC0 1.0 |

`maya-savings.svg` and `maya-credit.svg` are copies of `maya.svg` — same brand,
different product, told apart by card colour.

**CC BY 4.0 requires attribution**, which is what this file is for. The two
affected files are Maya and BPI.

MariBank has no logo here: it is on neither Commons nor simple-icons, so its
card falls back to the drawn mark in `components/BrandWatermark.jsx`.

## The trademark position

These are trademarks of their owners. Spendr's own Settings page states that
the app is unaffiliated with these institutions and uses their names only as
labels, which remains true — the marks identify *your* accounts to *you*, on
your own device. That is a different thing from implying endorsement, but it is
worth knowing that a licence permitting reuse of a logo *file* is not a licence
to use the *trademark*, and the two are separate questions. Included at the
owner's request for a personal build.
