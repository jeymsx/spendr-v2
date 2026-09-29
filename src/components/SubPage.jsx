import PageHeader from './PageHeader'

/**
 * The app's sub-page shell: back disc, centred title, optional right action.
 *
 * This is the header Goals, Bills, Debts, AccountDetail and AccountNew all
 * hand-rolled, extracted the fifth time it was needed rather than the sixth.
 * Every page that is reached from somewhere else rather than from the navbar
 * wants exactly this, and wants it identical - a back button that moves by a
 * pixel between screens is the kind of thing you feel without being able to
 * name.
 *
 * The spacer on the right is not decoration. The title is `flex-1
 * text-center`, so it centres within the space left over - and with a 36px
 * button on the left and nothing on the right, "centred" lands 18px left of
 * the actual centre. The spacer restores the symmetry.
 *
 * pb-page, not pb-nav: the layout's page wrapper already keeps the fixed
 * tab bar's height clear under every page (layouts/AppLayout.jsx), and this
 * adding it a second time left 80px of nothing above the bar at the end of
 * every subpage, where 24 is the page's own breathing room.
 *
 * The header itself is PageHeader, which the pages that lay themselves out
 * use too, and it stays pinned while the page scrolls under it.
 */
export default function SubPage({ title, action = null, onBack, children, className = '' }) {
  return (
    <div className={`pb-page ${className}`}>
      <PageHeader title={title} action={action} onBack={onBack} />

      {children}
    </div>
  )
}
