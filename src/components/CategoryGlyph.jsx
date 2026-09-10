import {
  IconToolsKitchen2, IconShoppingBag, IconBus, IconReceipt2, IconMovie, IconUser,
  IconHome2, IconHeartbeat, IconSchool, IconPlane, IconPaw, IconDeviceLaptop,
  IconGift, IconTool, IconBarbell, IconChefHat, IconShirt, IconShoppingCart,
  IconRepeat, IconMusic, IconBabyCarriage, IconHeartHandshake, IconBeer,
  IconPercentage, IconCreditCard, IconCashBanknote, IconBriefcase, IconChartLine,
  IconGiftCard, IconCoin, IconReceiptRefund, IconAward, IconTag, IconCoins,
  IconPackage, IconTrendingUp, IconArrowsExchange, IconReceiptTax,
} from '@tabler/icons-react'

/**
 * A category's icon, derived from its name.
 *
 * ── Why derived, and not a column ──
 *
 * The obvious design is an `iconKey` field on the category, set when you pick
 * one. It is also the expensive one: `categories.icon` is pushed to Supabase
 * (categoryToRow, upserting on user_id,name,type), so a new field means a
 * migration, a fallback for every row written before it existed, and a picker
 * to set it.
 *
 * None of that buys anything here. The categories that need icons are the
 * thirty-nine PRESETS, and a preset is identified by its name - so the name is
 * already the key. Deriving costs one lookup, needs no migration, no
 * db.version bump, no sync change, and no write path touched.
 *
 * The degradation is the good part: a category this map does not know keeps
 * its emoji. So a user who typed a custom category, or one specific to how
 * they live - a jeepney allowance, a sari-sari tab - is not handed a generic
 * box because an icon set had no glyph for it. Emoji are infinite where a pack
 * is not, and that is worth keeping for exactly the long tail.
 *
 * A renamed category falls back to its emoji too. That is honest rather than
 * ideal: the icon followed the name, and the name changed.
 *
 * ── Why Tabler here, when the chrome is Untitled UI ──
 *
 * Because Untitled UI genuinely cannot do this. Searched by substring across
 * all 1,179 of its exports: zero food, zero pets, zero clothing, zero baby,
 * zero fitness. It is a product-interface set - 106 user icons, 90 arrows, 86
 * commerce, and one lifestyle object (scissors). That is exactly why it
 * answered all fifteen chrome roles.
 *
 * Tabler covers 38/38 of these. Two packs is a real cost, but a narrow one:
 * tree-shaking means only the icons imported here ship, so the runtime cost is
 * the same as if they came from one pack, and both sets are 24x24 with round
 * caps and joins - so at a shared 1.8 they sit together. The boundary is also
 * meaningful rather than arbitrary: Untitled UI draws interface, Tabler draws
 * objects.
 */
const CATEGORY_ICON = {
  // ── Expense presets ──
  'Food':           IconToolsKitchen2,
  'Dining Out':     IconChefHat,
  'Groceries':      IconShoppingCart,
  'Shopping':       IconShoppingBag,
  'Clothing':       IconShirt,
  'Transpo':        IconBus,
  'Bills':          IconReceipt2,
  'Rent':           IconHome2,
  'Health':         IconHeartbeat,
  'Fitness':        IconBarbell,
  'Education':      IconSchool,
  'Travel':         IconPlane,
  'Entertainment':  IconMovie,
  'Music':          IconMusic,
  'Subscriptions':  IconRepeat,
  'Tech':           IconDeviceLaptop,
  'Pets':           IconPaw,
  'Baby/Kids':      IconBabyCarriage,
  'Personal':       IconUser,
  'Gifts':          IconGift,
  'Donations':      IconHeartHandshake,
  'Repairs':        IconTool,
  'Vices':          IconBeer,
  'Fees & Charges': IconPercentage,
  'Card Interest':  IconCreditCard,

  // ── Inflow presets ──
  'Salary':         IconCashBanknote,
  'Freelance':      IconBriefcase,
  'Investment':     IconChartLine,
  'Interest':       IconPercentage,
  'Gift Money':     IconGiftCard,
  'Allowance':      IconCoin,
  'Refund':         IconReceiptRefund,
  'Bonus':          IconAward,
  'Sold Item':      IconTag,
  'Dividends':      IconCoins,

  // ── System categories ──
  'Others':         IconPackage,
  'Income':         IconTrendingUp,
  'Transfer':       IconArrowsExchange,
  'Transfer Fee':   IconReceiptTax,
}

/** The component for a category, or null when it is not a known preset. */
export function categoryIcon(cat) {
  return CATEGORY_ICON[cat?.name] ?? null
}

/**
 * Render a category's glyph: its icon if we have one, its emoji if not.
 *
 * `emoji` overrides the fallback for the handful of places that want something
 * other than a box when there is no category at all - a bill row wants the
 * repeat arrows, a statement row wants a card.
 *
 * Tabler's stroke-WIDTH prop is called `stroke` (its colour prop is `color`),
 * which is a trap worth naming: passing strokeWidth here does nothing. 1.8 is
 * the app's weight, set to match the navbar - see LucideProvider's replacement
 * note in components/icons.jsx.
 */
export default function CategoryGlyph({ cat, size = 20, emoji = '📦', className = '', color = true }) {
  const Icon = categoryIcon(cat)
  if (Icon) {
    /* The glyph takes the category's colour by default.
    
       It inherited currentColor before, which made a list of transactions a
       column of identical grey icons - the colour was sitting in cat.color
       being spent on a 12% background wash and thrown away on the glyph. The
       two-theme correction lives in .cat-glyph in index.css, because an inline
       style cannot answer a theme; only the colour comes from here.
    
       `color={false}` is for the places where the glyph sits on a coloured
       ground of its own and has to stay legible against it - a filled chip, or
       a selected tile - and for the onboarding grids, whose rows are already
       colour-coded by selection state. */
    return (
      <Icon
        size={size}
        stroke={1.8}
        className={`${color ? 'cat-glyph' : ''} ${className}`}
        style={color ? { '--cat-color': cat?.color ?? '#64748b' } : undefined}
        aria-hidden="true"
      />
    )
  }
  return (
    <span
      className={className}
      style={{ fontSize: size * 0.95, lineHeight: 1 }}
      aria-hidden="true"
    >
      {cat?.icon ?? emoji}
    </span>
  )
}
