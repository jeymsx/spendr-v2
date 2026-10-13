import Button from '../../components/ui/Button'

/**
 * The two answers to "Still want it?", on a wish whose wait is over.
 *
 * Skip is the filled one: it is the answer the wishlist exists to make easy.
 * Buy is plain - one tap, nothing in its way, but not where the eye lands
 * first.
 *
 * @param {{wish: WishRow, onSkip: (w: WishRow) => void, onBuy: (w: WishRow) => void}} props
 */
export function Answers({ wish, onSkip, onBuy }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button size="xs" onClick={() => onSkip(wish)}>Skip</Button>
      <Button size="xs" variant="outline" onClick={() => onBuy(wish)}>Buy</Button>
    </div>
  )
}

/**
 * What the wish's form offers below Save: putting a decided one back on the
 * list, and deleting it.
 *
 * @param {{wish: WishRow, onPutBack: (w: WishRow) => void, onRemove: (w: WishRow) => void}} props
 */
export function FormActions({ wish, onPutBack, onRemove }) {
  const decided = (wish.status ?? 'waiting') !== 'waiting'
  return (
    <div className="flex flex-col gap-3">
      {decided && (
        <Button variant="outline" block onClick={() => onPutBack(wish)}>Put it back on the list</Button>
      )}
      <Button variant="quiet" block onClick={() => onRemove(wish)}>
        <span className="text-red-500 dark:text-red-400">Delete wish</span>
      </Button>
    </div>
  )
}
