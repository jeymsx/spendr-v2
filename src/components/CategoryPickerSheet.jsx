import Sheet from './ui/Sheet'
import CategoryTile from './CategoryTile'

export default function CategoryPickerSheet({ open, onClose, categories, selected, onSelect }) {
  const pick = (cat) => { onSelect(cat); onClose() }

  return (
    /* 78dvh: a four-column grid of every expense category is the longest
       list in the app, so this is where a short sheet forced the most
       scrolling. Sheet's feathered, scrolling body and the grab handle are
       its own now - this file used to build both. */
    <Sheet
      open={open}
      onClose={onClose}
      z={130}
      scrim={40}
      maxHeight="78dvh"
      title="Select Category"
    >
      <div>
        {/* The tile the add form uses, not a second answer to the same
            question.

            This marked its selection with an accent ring and a dot beneath -
            in a grid where every tile already carries its own category
            colour, "which one is on?" was answered in a colour belonging to
            none of them, which is the exact reasoning that took the ring off
            the add form's rail. So the tile is filled with the category's own
            colour here too, with the glyph inked against it: `.cat-tile` and
            --cat-ink, the same two the rail sets. See index.css.

            The dot goes with the ring. A filled tile in a grid of unfilled
            ones does not need a second mark to say it is chosen, and the dot
            was changing the tile's height by 6px depending on selection. */}
        {/* Five across, at the rail's own spacing.

            Four columns at gap-2.5 was a different grid from the row you pick
            from on the add form, and the two are the same act. Five at gap-1.5
            puts the same 50px tiles the same 6px apart; the extra width each
            cell has over the tile is what centres them. */}
        <div className="grid grid-cols-5 gap-1.5 gap-y-4">
            {categories.map(cat => {
              const isSelected = selected?.id === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => pick(cat)}
                  aria-pressed={isSelected}
                  className="flex flex-col items-center gap-1.5
                    active:scale-95 transition-transform duration-75"
                >
                  <CategoryTile cat={cat} on={isSelected} />
                </button>
              )
            })}
        </div>
      </div>
    </Sheet>
  )
}
