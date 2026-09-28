/**
 * The medallions that never animate - the milestones' and challenges' tabs -
 * as files of their own, so the home page doesn't carry their SVG inline.
 * Drawn at build time by the app's own glass.js, like every other one.
 */
import type { APIRoute, GetStaticPaths } from 'astro'
import { tracks, challenges, hueOf } from '../../data/app'
import { medallion } from '../../data/glass'

type Art = { glyph: string; hue: string; shape: 'circle' | 'shield'; level?: string }

const ART: Record<string, Art> = {}
for (const t of tracks) ART[`track-${t.key}`] = { glyph: t.glyph, hue: hueOf(t.tone), shape: 'circle', level: t.levels[0].label }
for (const c of challenges) ART[`challenge-${c.key}`] = { glyph: c.glyph, hue: hueOf(c.tone), shape: 'shield' }

export const getStaticPaths: GetStaticPaths = () => Object.keys(ART).map(name => ({ params: { name } }))

export const GET: APIRoute = ({ params }) =>
  new Response(medallion(ART[params.name as string]), { headers: { 'Content-Type': 'image/svg+xml' } })
