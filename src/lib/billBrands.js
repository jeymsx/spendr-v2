/**
 * Which brand a bill is, worked out from what you called it.
 *
 * Bills are free text - "Netflix", "netflix ph", "YouTube Premium", "PS Plus"
 * - so this is a lookup by name, the same shape as categoryIcon() and
 * accountBrand(). A name it does not know returns null and the caller keeps
 * the category glyph it was already drawing, which is the app's usual way of
 * degrading: see CategoryGlyph's note on why an unknown category keeps its
 * emoji rather than being handed a generic box.
 *
 * ── The colour is the brand's own ──
 *
 * Not recoloured per theme, and not flattened to white the way the account
 * watermarks are. A logo you cannot recognise by colour is most of a logo
 * thrown away - Spotify is the green one - so the mark carries its real hex
 * and sits on a white chip, which is what a favicon does and what every
 * banking app that shows merchants does.
 *
 * The chip is what makes one hex work in both themes. Painting the mark
 * straight onto the page meant black brands (Notion, HBO, TikTok, Apple,
 * Steam) measured 1.09:1 in dark mode, and no amount of lightening fixes
 * that without ceasing to be the brand's colour.
 *
 * On white, 21 of the 25 clear 3:1. The four that do not - Spotify 1.92,
 * Duolingo 2.09, Audible 2.20, Grab 2.84 - are light-coloured brands whose
 * own apps have the same problem, and the alternative was to stop showing
 * their real colour. The bill's name is always rendered beside the mark, so
 * nothing here is the only carrier of meaning.
 */

/* slug -> the brand's own hex, from simple-icons' published data. */
export const BILL_BRAND_COLORS = {
  netflix:       '#e50914',
  spotify:       '#1ed760',
  youtube:       '#ff0000',
  youtubemusic:  '#ff0000',
  applemusic:    '#fa243c',
  icloud:        '#3693f3',
  apple:         '#000000',
  claude:        '#d97757',
  chatgpt:       '#000000',
  gemini:        '#8e75b2',
  google:        '#4285f4',
  /* Meralco's own orange. The mark is two-tone at source - a dark spark
     behind an orange one - and flattens to the orange, which is the half
     that carries the brand. */
  meralco:       '#ef924f',
  hbo:           '#000000',
  max:           '#525252',
  crunchyroll:   '#ff5e00',
  steam:         '#000000',
  playstation:   '#0070d1',
  figma:         '#f24e1e',
  notion:        '#000000',
  github:        '#181717',
  dropbox:       '#0061ff',
  zoom:          '#0b5cff',
  duolingo:      '#58cc02',
  coursera:      '#0056d2',
  udemy:         '#a435f0',
  grab:          '#00b14f',
  shopee:        '#ee4d2d',
  tiktok:        '#000000',
  discord:       '#5865f2',
  audible:       '#f8991c',
}

/**
 * Spellings that reach a slug.
 *
 * Order matters only in that the longest match wins, which is what keeps
 * "Apple Music" off `apple` and "YouTube Music" off `youtube`.
 */
/** @type {Record<string, string>} */
const ALIASES = {
  netflix: 'netflix',
  spotify: 'spotify',
  youtubemusic: 'youtubemusic', ytmusic: 'youtubemusic',
  youtubepremium: 'youtube', youtube: 'youtube',
  applemusic: 'applemusic',
  appletv: 'apple', applecare: 'apple', applestorage: 'apple',
  icloud: 'icloud', icloudplus: 'icloud',
  hbogo: 'hbo', hbo: 'hbo',
  hbomax: 'max',
  crunchyroll: 'crunchyroll',
  steam: 'steam',
  playstation: 'playstation', psplus: 'playstation', psn: 'playstation',
  figma: 'figma',
  notion: 'notion',
  github: 'github', githubcopilot: 'github', copilot: 'github',
  dropbox: 'dropbox',
  zoom: 'zoom',
  duolingo: 'duolingo',
  coursera: 'coursera',
  udemy: 'udemy',
  grabunlimited: 'grab', grab: 'grab',
  shopee: 'shopee',
  tiktok: 'tiktok',
  discord: 'discord', discordnitro: 'discord', nitro: 'discord',
  audible: 'audible',
  apple: 'apple',
  /* The AI subscriptions. "Claude Pro", "ChatGPT Plus", "Gemini
     Advanced", "Google One" - the plan word is what people actually
     type, so each maps from the product rather than the company. */
  claudepro: 'claude', claudeai: 'claude', claude: 'claude',
  chatgptplus: 'chatgpt', chatgptpro: 'chatgpt', chatgpt: 'chatgpt',
  openai: 'chatgpt',
  geminiadvanced: 'gemini', googlegemini: 'gemini', gemini: 'gemini',
  googleone: 'google', googlestorage: 'google', google: 'google',
  /* Philippine utilities. The electricity bill is called all of these. */
  meralco: 'meralco', meralcobill: 'meralco', kuryente: 'meralco',
}

/* Longest first, so "applemusic" is tested before "apple". */
const KEYS = Object.keys(ALIASES).sort((a, b) => b.length - a.length)

/* Below this, a key is only accepted as a whole word. "max" inside
   "Maxicare" is a health card, not HBO. */
const WHOLE_WORD_BELOW = 6

/** @param {unknown} s */
/** @param {unknown} s */
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * The brand slug for a bill name, or null.
 *
 * @param {string} name  Whatever the bill is called.
 * @returns {string|null}
 *
 * @param {string} [name]
 */
export function billBrandKey(name) {
  const flat = squash(name)
  if (!flat) return null
  const words = String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

  for (const key of KEYS) {
    if (key.length < WHOLE_WORD_BELOW) {
      if (words.includes(key)) return ALIASES[key]
    } else if (flat.includes(key)) {
      return ALIASES[key]
    }
  }
  return null
}
