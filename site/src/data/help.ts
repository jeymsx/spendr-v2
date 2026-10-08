/**
 * The help centre's content, read from the app's own module at build time
 * (src/lib/help.js), so the website and the app's /help say the same thing.
 * This file only types it and resolves ids; the words live in the app.
 */
// @ts-ignore - the app's modules are JS with JSDoc
import { HELP_TOPICS, HELP_ARTICLES, HELP_POPULAR, HELP_QUICK, WIDE_SHOTS, DARK_ONLY_SHOTS } from '../../../src/lib/help.js'
import { screens } from './screens'

export type HelpBlock =
  | { p: string }
  | { steps: string[] }
  | { tip: string }
  | { shot: string; caption?: string }
  | { go: string; label: string }

export interface HelpArticle {
  id: string
  topic: string
  title: string
  summary: string
  keywords?: string[]
  body: HelpBlock[]
  related?: string[]
}

export interface HelpTopic { id: string; title: string; blurb: string; icon: string }

export const topics: HelpTopic[] = HELP_TOPICS
export const articles: HelpArticle[] = HELP_ARTICLES

const byId = new Map(articles.map(a => [a.id, a]))
const topicById = new Map(topics.map(t => [t.id, t]))

export const article = (id: string): HelpArticle | null => byId.get(id) ?? null
export const topic = (id: string): HelpTopic | null => topicById.get(id) ?? null
export const articlesIn = (topicId: string): HelpArticle[] => articles.filter(a => a.topic === topicId)

/** Ids to articles, dropping any that no longer exist. */
const resolve = (ids: string[] = []): HelpArticle[] => ids.map(article).filter((a): a is HelpArticle => !!a)

export const popular: HelpArticle[] = resolve(HELP_POPULAR)
export const quick: HelpArticle[] = resolve(HELP_QUICK)
export const relatedTo = (a: HelpArticle): HelpArticle[] => resolve(a.related).filter(r => r.id !== a.id)

/** The topic glyphs, as Tabler icons (the app maps the same names to its own). */
const ICONS: Record<string, string> = {
  rocket: 'rocket', plus: 'plus', list: 'list-details', wallet: 'wallet', 'chart-pie': 'chart-pie',
  repeat: 'repeat', target: 'target', 'chart-line': 'chart-line', cloud: 'cloud', settings: 'settings',
}
export const topicIcon = (t: HelpTopic): string => ICONS[t.icon] ?? 'help-circle'

/** "1 article", "12 articles", or none yet. */
export function countLabel(n: number): string {
  return n === 0 ? 'No articles yet' : n === 1 ? '1 article' : `${n} articles`
}

/** Shots of the computer layout, drawn in a browser window rather than a phone. */
export const isWide = (name: string): boolean => (WIDE_SHOTS as Set<string>).has(name)
/** The Wrapped slides: colour in both themes, so the phone's status bar is white. */
export const isOnColor = (name: string): boolean => (DARK_ONLY_SHOTS as Set<string>).has(name)
/** Whether the site has a capture by that name; an unknown one is skipped, with a warning. */
export const hasShot = (name: string): boolean => name in screens

/** What each capture shows, for its alt text. */
const SHOT_ALT: Record<string, string> = {
  home: 'Spendr’s Home screen',
  transactions: 'The Transactions list',
  expense: 'The expense form, filled in',
  'ql-expense-form': 'The expense form, filled in by quick log',
  'ql-transfer-form': 'The transfer form, filled in by quick log',
  accounts: 'The Accounts page',
  card: 'A credit card’s page',
  budget: 'Budgets',
  recurring: 'Recurring bills',
  goals: 'Goals',
  debts: 'Debts',
  insights: 'Insights',
  networth: 'Net worth',
  forecast: 'The forecast',
  achievements: 'Achievements',
  desktop: 'Spendr’s Home on a computer',
  'desktop-insights': 'Insights on a computer',
}
export const shotAlt = (name: string): string =>
  SHOT_ALT[name] ?? (name.startsWith('wrapped-') ? 'A slide from Wrapped' : 'A screen in Spendr')
