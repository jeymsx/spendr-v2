import { CardDesignGallery, ColorRail, PreviewCard } from '../../components/CardStyle'
import Confetti from '../../components/Confetti'
import Button from '../../components/ui/Button'

// ── Card style step ────────────────────────────────────────────────────────────

/**
 * The card, stood up on its end.
 *
 * A CSS rotation of the real landscape face rather than a second portrait
 * layout, which is what the reference does too - its wordmark reads
 * bottom-to-top because the whole card is turned, not redrawn. One layout to
 * maintain, and what you are looking at is provably the card you are about to
 * get rather than an illustration of it.
 *
 * A transform never changes the layout box, so the wrapper is sized to the
 * PORTRAIT footprint and the landscape card is centred inside it and turned.
 * Rotating a w x h box by 90 degrees gives an h x w footprint, so the card is
 * built at (portraitH x portraitW) and lands exactly filling the wrapper. Get
 * that backwards and it overflows by the difference - the same trap the tilted
 * detail card fell into when its rotation saved no vertical space.
 */
/**
 * Choosing how the card looks.
 *
 * Everything on this step - the coverflow gallery, the dots, the colour row -
 * is in components/CardStyle.jsx, because the edit screen shows the same
 * three controls and two copies of a hand-tuned coverflow rail would not stay
 * the same for long.
 */
export function StyleStep({ draft, set, action }) {
  return (
    <section className="flex-1 flex flex-col justify-center min-h-0 py-2">
      <CardDesignGallery draft={draft} set={set} />

      <div className="mt-4 px-5">
        <ColorRail draft={draft} set={set} />
      </div>

      {/* The button lives INSIDE the centred group on this step, not pinned to
          the bottom of the screen.

          Pinned, it sat a long way under the colour row with nothing between
          them - and because the section above it was flex-1, the section ate
          every spare pixel and left the whole group riding high with a gap
          beneath. Part of the same group, all five pieces centre together:
          card, name, dots, colours, button.

          It is also the only step where this is possible. One and two scroll,
          and a button that scrolls away with the content has to sit at the
          end of it; this step fits on one screen by design, so the button can
          be where the eye already is. */}
      <div className="mt-6 px-5 flex justify-center">{action}</div>

      {/* No error here. The name cannot be edited on this step, and step one
          will not let a duplicate through - so the only way to arrive with a
          bad name is another device syncing one while you stood on this
          screen. save() already handles that by dropping back to step one,
          where the field shows the reason next to itself. */}
    </section>
  )
}

/**
 * What you see the moment the account exists.
 *
 * Creating one used to end in a toast and a jump to the list, where the card
 * you had just spent three steps choosing was one tile among nine, at a
 * third of the size, with nothing marking it as new. Three steps of
 * deciding, and no moment of having decided.
 *
 * So the card gets the screen once, at full size, lying flat - the same face
 * from the gallery, now an account rather than a preview. Confetti says the
 * thing happened; the buttons say what can happen next.
 */
export function CreatedStep({ draft, onDone, onAddTransaction }) {
  const isCredit = draft.type === 'credit'

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-5 text-center">
      <Confetti />

      <div style={{ animation: 'pageFadeIn 0.45s ease both' }}>
        <h2 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          You&rsquo;re all set!
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{draft.name.trim()}</span>
          {' '}has been added to your accounts.
        </p>
      </div>

      {/* Rises a little later than the text, so the card arrives rather than
          appearing with it. */}
      <div className="w-full mt-7" style={{ animation: 'quickIn 0.5s 0.12s cubic-bezier(0.32, 0.72, 0, 1) both' }}>
        <PreviewCard draft={draft} large />
      </div>

      <p className="mt-5 text-[12.5px] leading-relaxed text-slate-400 dark:text-slate-500 max-w-[300px]">
        {isCredit
          ? 'Charges you log to it count against the limit, and installments spread across the statements they will land on.'
          : 'Log an expense, an inflow or a transfer against it and the balance keeps itself.'}
      </p>

      <div className="w-full mt-8 flex flex-col gap-2.5" style={{ animation: 'pageFadeIn 0.5s 0.3s ease both' }}>
        <Button block onClick={onDone}>
          Done
        </Button>
        <Button variant="secondary" size="sm" block onClick={onAddTransaction}>
          Add a transaction
        </Button>
      </div>
    </section>
  )
}
