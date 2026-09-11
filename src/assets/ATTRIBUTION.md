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

## Subscription brands — `bill-logos/`

From [simple-icons](https://github.com/simple-icons/simple-icons) v16,
**CC0 1.0** (the icons; the repo's code is MIT) — the same source as the card
networks below. 25 files, ~21KB of path data.

Stored as shipped apart from three removals: `<title>`, `role="img"`, and
unused `xmlns:xlink`. Paths untouched, no `viewBox` cropping needed — every
one arrives as a 24x24 logomark. No paint is added; `.bill-mark` fills them
with `currentColor`.

netflix, spotify, youtube, youtubemusic, applemusic, icloud, apple, hbo, max,
crunchyroll, steam, playstation, figma, notion, github, dropbox, zoom,
duolingo, coursera, udemy, grab, shopee, tiktok, discord, audible.

Brand hexes in `src/lib/billBrands.js` are from simple-icons' published
`simple-icons.json`, not sampled by eye.

Philippine utilities — Meralco, Maynilad, Globe, PLDT — are deliberately
absent; see `bill-logos/README.md`.

## Card networks — `scheme-logos/`

From [simple-icons](https://github.com/simple-icons/simple-icons), **CC0 1.0**
(the icons; the repo's code is MIT).

| File | Brand | Source |
|---|---|---|
| `visa.svg` | Visa | simple-icons, CC0 |
| `amex.svg` | American Express | simple-icons, CC0 |
| `jcb.svg` | JCB | simple-icons, CC0 |
| `mastercard.svg` | Mastercard | **constructed here** — see below |

Each of these had its `viewBox` cropped to its own ink. simple-icons draws
every mark into a 24×24 box, so each carries a different amount of padding —
Visa fills 41% of the height, Amex 100% — and sizing them by height uncropped
renders four marks at four different apparent sizes.

`mastercard.svg` is **not** the traced file. Mastercard's mark is printed in
full colour on essentially every real card, and simple-icons is monochrome by
design — a single path, which flattens the two interlocking circles into one
blob. The mark's geometry is exactly specified, though, so it is constructed
rather than traced: two equal circles with their centres 0.6 of a diameter
apart, and the lens of their intersection filled in the darker orange
(`#EB001B`, `#F79E1B`, `#FF5F00`). The resulting 1.6:1 proportion matches the
1.62 measured off the traced file, which is the check that the construction is
faithful. Being a construction from public brand geometry, it carries no
third-party file licence — the trademark position below still applies.

## Institutions — `brand-logos/`

| File | Source | Licence |
|---|---|---|
| `gcash.svg` | Wikimedia Commons, *GCash logo.svg* | Public domain |
| `gotyme.svg` | Wikimedia Commons, *GoTyme Bank logo.svg* | Public domain |
| `metrobank.svg` | Wikimedia Commons, *Metropolitan Bank and Trust Company.svg* | Public domain |
| `maya.svg` | Wikimedia Commons, *Maya logo.svg* | **CC BY 4.0** |
| `bpi.svg` | Wikimedia Commons, *Official BPI Logo.svg* | **CC BY 4.0** |
| `spaylater.svg` | simple-icons, *Shopee* | CC0 1.0 |

### Fetched from Commons in bulk

| File | Source | Licence |
|---|---|---|
| `aub.svg` | Wikimedia Commons, *Asia United Bank logo.svg* | Public domain |
| `bdo.svg` | Wikimedia Commons, *BDO Unibank (logo).svg* | Public domain |
| `china-bank.svg` | Wikimedia Commons, *Chinabank logo.svg* | Public domain |
| `cimb.svg` | Wikimedia Commons, *CIMB Group Logo.svg* | Public domain |
| `citibank.svg` | Wikimedia Commons, *Citibank.svg* | Public domain |
| `eastwest.svg` | Wikimedia Commons, *EastWest Bank 2011 h-pos logo.svg* | Public domain |
| `grabpay.svg` | Wikimedia Commons, *Grab Logo.svg* | Public domain |
| `hsbc.svg` | Wikimedia Commons, *Hsbc-logo.svg* | Public domain |
| `ing.svg` | Wikimedia Commons, *ING Group (wordmark).svg* | Public domain |
| `pnb.svg` | Wikimedia Commons, *Philippine-National-Bank-logo.svg* | Public domain |
| `landbank.svg` | English Wikipedia, *Landbank New.svg* | Public domain |
| `rcbc.svg` | Wikimedia Commons, *RCBC logo.svg* | Public domain |
| `robinsons-bank.svg` | Wikimedia Commons, *Robinsons Bank logo.svg* | Public domain |
| `unionbank.svg` | Wikimedia Commons, *Unionbank 2018 logo.svg* | Public domain |
| `wise.svg` | Wikimedia Commons, *New Wise (formerly TransferWise) logo.svg* | Public domain |

All of the above are **public domain**, which is a property of the source
rather than luck: Commons does not host fair-use material, so anything on it
is free or PD. Each was run through svgo with `removeViewBox` disabled —
dropping the viewBox is the one "optimisation" that stops an SVG scaling — and
three of them (`bdo`, `citibank`, `hsbc`) had a viewBox injected from their own
width and height first, because they had neither and the sanitiser strips
width and height so the render slot can control size.

**Five downloads were rejected**, and it is worth recording why. Scoring
search results on their filenames alone matched EastWest Bank to a Japanese
Railways mark (on the word "east"), Security Bank to the defunct US Security
Pacific, Wise to FarmWise, and SeaBank Philippines to SeABank Vietnam. Each
would have shipped a confidently wrong logo, which is worse than none — a
monogram reads as a stand-in, a wrong logo reads as a mistake. The fix was to
verify every candidate against its own Commons description, categories and
wikitext rather than its title; EastWest and Wise were then found correctly
on a second pass.

The fifth, `cimb`, is the instructive one: it *passed* automated verification
and was still wrong. The file was the **CIMB Niaga** wordmark — the Indonesian
subsidiary — so it rendered another company's name on the card, and no
description check would ever have caught that, because the description was
accurate. It took looking at it. The replacement is *CIMB Group Logo*, the
parent brand CIMB Bank Philippines trades under.

`aub.svg` and `pnb.svg` are the two heaviest here at 16 and 15 KB, both being
detailed crests. They were dropped once on the grounds that none of that
detail survives being rendered at 7–10% opacity behind a card, and then put
back: that was a judgement about file weight, not about correctness, and the
logos are wanted. They are the reason this directory is ~95 KB rather than
~65 KB.

`seabank.svg` was removed because SeaBank Philippines is now MariBank, and the
template list was renamed to match. MariBank keeps its drawn mark.

### From the institution's own website

| File | Source | Licence |
|---|---|---|
| `security-bank.svg` | securitybank.com, `/wp-content/themes/sb/img/sbc-logo-short.svg` | **© Security Bank Corporation, all rights reserved** |
| `tonik.svg` | tonikbank.com, `/sites/default/files/2024-02/toniklogo_0.svg` | **© Tonik Digital Bank, all rights reserved** |

This one is **not** like the rest of this directory, and the distinction
matters enough to keep it in its own section. Every Commons file above is
public domain; this is the company's own copyrighted brand asset, taken from
its own site because it is not on any free-licence source. It is included at
the owner's request for a personal, undistributed build — see the trademark
position at the end of this file, which applies with more force here than
anywhere else.

Its viewBox was **padded out to square** (`0 0 26 37` → `-5.5 0 37 37`, art
unmoved). The mark is portrait at 0.70:1, and the compact-mark tier sizes by
width on the assumption a logomark is roughly square — 40% of the card's
width would have rendered this 90% of the card's *height*. Padding the box
makes the existing tier correct rather than adding a fourth one for a single
file.

`landbank.svg` is the bank's **current** mark, from English Wikipedia rather
than Commons - Wikipedia hosts non-free logos locally, so the licence had to
be checked rather than assumed, and this one is tagged public domain. It
replaced an older Commons file.

Of the sites the owner supplied, two yielded nothing usable: **PalawanPay**
and **PSBank** publish their logos only as PNG, which would blur as a
watermark and cannot be recoloured by the single CSS rule the rest of this
pipeline relies on, and **uno.bank** serves a 366-byte shell that renders its
markup in JavaScript, so there is no asset reference to follow. Those keep
their monograms.

Institutions with **no usable file** fall back to a monogram in the app's own
type: Coins.ph, PalawanPay, PSBank, UNO Digital Bank and OwnBank. Searching for these turned up one more trap worth naming —
*Netbank Logo 2006.svg* passed every automated check, and its description is
entirely in German for a company that predates Netbank Philippines by well
over a decade. Rejected.

Falling back is a deliberate choice over tracing the missing ones: thirty
hand-drawn approximations read as thirty slightly-wrong drawings, which is
the exact problem adopting real files solved. Facebook and image-search
results were not used either — they are raster, so they would blur as
watermarks, and they carry no verifiable licence, which is the one thing
Commons guarantees.

Four of the widest lockups - HSBC, UnionBank, CIMB and Landbank - were
**cropped to their emblem and then un-cropped**, and the reason is worth
keeping. The crop boxes came from `getBBox()` measured in the browser, which
looked authoritative next to scraping svgo-optimised relative path data. But
`getBBox` reports a shape's box in its OWN user space, before any ancestor
transform, so on a file with a group transform the numbers describe a
different coordinate system than the viewBox does. All four crops sliced
their marks. They render at the wide tier instead, and in the picker's square
tiles a wide mark is inset to 76% rather than run edge to edge.

Files are matched to accounts by filename, not by a per-bank rule — see
`logoCandidates` in `lib/accountBrands.js` — so "BDO Credit" finds `bdo.svg`
and dropping a new file into this directory needs no code change.

## The trademark position

These are trademarks of their owners. Spendr's own Settings page states that
the app is unaffiliated with these institutions and uses their names only as
labels, which remains true — the marks identify *your* accounts to *you*, on
your own device. That is a different thing from implying endorsement, but it is
worth knowing that a licence permitting reuse of a logo *file* is not a licence
to use the *trademark*, and the two are separate questions. Included at the
owner's request for a personal build.
