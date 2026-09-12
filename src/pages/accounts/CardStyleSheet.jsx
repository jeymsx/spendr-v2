import Sheet from '../../components/ui/Sheet'
import { CardDesignGallery, ColorRail } from '../../components/CardStyle'

// ── Card style sheet ────────────────────────────────────────────

/**
 * Customise card: the create flow's third step, reachable while editing.
 *
 * Editing an account used to offer fourteen solid swatches in a wrapped grid
 * and no way to change the design at all - so a card made with the gallery
 * could never be changed again, and the two screens disagreed about what
 * choosing a colour even looked like. This is the same CardDesignGallery and
 * the same ColorRail the create flow shows, in a sheet.
 *
 * It writes through to the form's own state rather than holding a copy, so
 * Cancel on the form still discards everything and there is no second draft
 * to reconcile.
 */
export function CardStyleSheet({ open, onClose, draft, set }) {
  /* No Done button any more: the scrim, Escape and the handle all dismiss a
     sheet, and this one commits every tap as it happens - there was nothing
     for Done to confirm. */
  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={150}
      scrim={55}
      title="Customise Card"
      maxHeight="94dvh"
    >
      {/* The card stands up here, exactly as it does on the create flow's
          style step - that upright card is the thing being chosen, and it
          is what makes this read as the same screen rather than a
          different one that happens to share a colour row.

          -mx-5 cancels the body's page gutter: the rail centres its cards
          with `calc(50% - cardWidth/2)` spacers, so it has to be as wide as
          the panel or the card bleeds stop 20px short of each edge. */}
      <div className="pt-2 pb-1 -mx-5">
        <CardDesignGallery draft={draft} set={set} />
      </div>

      <div className="mt-3">
        <ColorRail draft={draft} set={set} />
      </div>
    </Sheet>
  )
}
