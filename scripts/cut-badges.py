"""
Cut the badge artwork out of the generated sheets.

Run:  python scripts/cut-badges.py <sheet-1.png> <sheet-2.png>

── Why this is a script and not a one-off ──

It has been run three times and got a different answer each time, because the
two sheets came back with different problems and the third run had to make
them agree with each other. That is exactly the thing worth keeping.

── The two sheets failed differently ──

Neither came back transparent, and the same recipe does not cut both.

Sheet 1 arrived on a dark coloured BLOOM. The badge has a hard boundary and the
bloom is smooth, so it cuts on edge magnitude.

Sheet 2 arrived on a PAINTED checkerboard - the model drew the transparency
pattern instead of leaving the alpha empty. Every checker square has an edge,
so sheet 1's method finds nothing. It cuts on saturation instead: measured, the
checkerboard runs 1-2 and the badge bodies 44-132.

Both then take the span between the first and last hit in every row and every
column and intersect the two. A hexagon is convex, so that describes it exactly
- including the real rounded tips, which a hand-built polygon kept clipping -
and it fills back in the parts that are deliberately near-white and would
otherwise punch holes in their own badge: the coin stack, the target's pale
rings, the diamond.

── Sheet 2 needs an erosion and sheet 1 does not ──

On a dark bloom the antialiased rim blends toward black, so the leftover fringe
is invisible on a dark UI. On a near-white checkerboard the same fringe is
BRIGHT - measured at luminance 238 against a 151 body - and reads as a halo
around every badge. Eroding removes the blended ring rather than trying to
unmix it. Measured at 0, 2, 3 and 4: at 3 the bleed is gone and the first
surviving pixel is the badge's own frosted rim.

── One canonical box, which is the point of the third run ──

The sheets do not draw the badge at the same proportions. Sheet 1 came out
257 x 304 and sheet 2 246 x 300 - 4.6% narrower - and in a grid that reads as
the second set being stretched vertically, which is what got noticed.

So the silhouette is measured per badge and resampled to ONE box. That also
irons out the 6px of variation between badges within a sheet. Nothing here
depends on the sheets being consistent, which is just as well, because they
are not.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join('src', 'assets', 'badges')

# Reading order of each sheet, left to right and top row first.
SHEET1 = ['first-peso', 'seven-days', 'century', 'under-budget', 'green-month',
          'goal-funded', 'debt-cleared', 'on-autopilot', 'diversified', 'six-figures']
SHEET2 = ['thirty-days', 'five-hundred', 'year-one', 'steady-three', 'budget-master',
          'no-spend-week', 'rainy-day', 'debt-free', 'three-goals', 'seven-figures']

# The canonical rendered badge, inside a 320px square.
#
# 257 x 304 is sheet 1's own measured average, kept because that set is the one
# the proportions were signed off on. It is an aspect of 0.845 against a regular
# hexagon's 0.866 - a 2.4% difference, which is below what anyone can see, and
# matching the existing art matters more than matching the maths.
CANVAS = 320
BADGE_W, BADGE_H = 257, 304

SS = 4          # supersample factor for the mask's antialiasing
FINAL_COLORS = 255   # one palette slot is reserved for full transparency


def find_badges(mask, rows=2, cols=5, min_run=40):
    """Locate each badge as a run of mask in the row band, then in the column.

    Scanned globally rather than per grid cell: the badges on sheet 2 sit only
    19px apart and several touch their nominal cell boundary, so slicing the
    image into fifths finds pieces of two badges in one cell.
    """
    def runs(counts):
        on = counts > 3
        out, start = [], None
        for i, hit in enumerate(on):
            if hit and start is None:
                start = i
            elif not hit and start is not None:
                if i - start >= min_run:
                    out.append((start, i - 1))
                start = None
        if start is not None and len(on) - start >= min_run:
            out.append((start, len(on) - 1))
        return out

    bands = runs(mask.sum(axis=1))
    if len(bands) != rows:
        raise SystemExit(f'expected {rows} row bands, found {len(bands)}')

    boxes = []
    for y0, y1 in bands:
        spans = runs(mask[y0:y1 + 1].sum(axis=0))
        if len(spans) != cols:
            raise SystemExit(f'expected {cols} badges in a row, found {len(spans)}')
        for x0, x1 in spans:
            ys = np.where(mask[y0:y1 + 1, x0:x1 + 1].sum(axis=1) > 3)[0]
            boxes.append((x0, y0 + ys[0], x1, y0 + ys[-1]))
    return boxes


def coarse_mask(rgb, method):
    """Where the badges are, roughly - enough to locate them on the sheet."""
    a = rgb.astype(np.float32)
    if method == 'saturation':
        return (a.max(axis=2) - a.min(axis=2)) > 12
    grey = a.mean(axis=2)
    ex = np.abs(np.diff(grey, axis=1, prepend=grey[:, :1]))
    ey = np.abs(np.diff(grey, axis=0, prepend=grey[:1, :]))
    return (ex + ey) > 14


def silhouette(tile_rgb, method, erode):
    """The badge's exact outline, as a boolean mask. See the module note."""
    a = tile_rgb.astype(np.float32)
    if method == 'saturation':
        hit = (a.max(axis=2) - a.min(axis=2)) > 10
    else:
        grey = a.mean(axis=2)
        ex = np.abs(np.diff(grey, axis=1, prepend=grey[:, :1]))
        ey = np.abs(np.diff(grey, axis=0, prepend=grey[:1, :]))
        hit = (ex + ey) > 12

    h, w = hit.shape
    rows = np.zeros_like(hit)
    cols = np.zeros_like(hit)
    for y in range(h):
        xs = np.where(hit[y])[0]
        if len(xs) >= 2:
            rows[y, xs[0]:xs[-1] + 1] = True
    for x in range(w):
        ys = np.where(hit[:, x])[0]
        if len(ys) >= 2:
            cols[ys[0]:ys[-1] + 1, x] = True

    img = Image.fromarray(((rows & cols) * 255).astype(np.uint8), 'L')
    if erode:
        img = img.filter(ImageFilter.MinFilter(erode * 2 + 1))
    return img


def cut_sheet(path, keys, method, erode, pad=14):
    im = Image.open(path).convert('RGB')
    rgb = np.asarray(im)
    boxes = find_badges(coarse_mask(rgb, method))

    for key, (x0, y0, x1, y1) in zip(keys, boxes):
        # Pad the crop so the erosion and the blur have room to work in, and
        # clamp to the sheet so a badge near the edge does not shift.
        cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
        cx1, cy1 = min(im.width, x1 + pad + 1), min(im.height, y1 + pad + 1)
        tile = im.crop((cx0, cy0, cx1, cy1))

        m = silhouette(np.asarray(tile), method, erode)
        w, h = m.size
        m = (m.resize((w * SS, h * SS), Image.NEAREST)
              .filter(ImageFilter.GaussianBlur(SS * 0.7))
              .resize((w, h), Image.LANCZOS))
        # Push the mid greys to opaque so the rim keeps its full colour, and
        # clip the tail so no background survives as a faint halo.
        alpha = np.clip((np.asarray(m).astype(np.float32) - 90) * (255 / 110), 0, 255)

        cut = tile.convert('RGBA')
        cut.putalpha(Image.fromarray(alpha.astype(np.uint8), 'L'))

        # Trim to the silhouette, then resample to the canonical box. This is
        # what makes every badge the same size regardless of how the sheet drew
        # it - see the module note.
        ys, xs = np.where(np.asarray(cut)[:, :, 3] > 40)
        cut = cut.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        cut = cut.resize((BADGE_W, BADGE_H), Image.LANCZOS)

        out = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        out.paste(cut, ((CANVAS - BADGE_W) // 2, (CANVAS - BADGE_H) // 2), cut)
        # Each badge is one hue family, so 255 levels shows no banding - checked
        # side by side against the un-quantised original.
        out = out.quantize(colors=FINAL_COLORS, method=Image.FASTOCTREE).convert('RGBA')

        dest = os.path.join(OUT, key + '.png')
        out.save(dest, optimize=True)
        print(f'{key:15s} {os.path.getsize(dest) // 1024:3d} KB')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__.strip().splitlines()[2])
    os.makedirs(OUT, exist_ok=True)
    print('sheet 1 - cut on edge magnitude, no erosion')
    cut_sheet(sys.argv[1], SHEET1, method='edge', erode=0)
    print('sheet 2 - cut on saturation, eroded 3px')
    cut_sheet(sys.argv[2], SHEET2, method='saturation', erode=3)
