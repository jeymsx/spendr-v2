/**
 * The help centre's search field: answers drop down under it as you type,
 * and Enter (or "Show all results") opens the full list at /help/search.
 *
 * The answers come from the app's own search (src/lib/helpSearch.js), so the
 * website and the app find the same answers for the same words. It carries
 * every article's text, so it's fetched only once someone reaches for the
 * field: on hover, focus or a tap, well before the first letter lands.
 *
 * The field is an ARIA combobox: focus stays in it, the arrows move through
 * the answers (aria-activedescendant), Enter opens the one picked, and Escape
 * closes the list, or clears the field when it's already closed.
 */
export interface Hit { id: string; title: string; summary: string; topic: string }
interface Engine { search: (q: string, limit: number) => Hit[]; topicTitle: (id: string) => string }

let engine: Promise<Engine> | null = null

export function loadEngine(): Promise<Engine> {
  engine ??= Promise.all([
    // @ts-ignore - the app's modules are JS with JSDoc
    import('../../../src/lib/helpSearch.js'),
    // @ts-ignore
    import('../../../src/lib/help.js'),
  ]).then(([s, h]) => ({
    search: (q: string, limit: number) => s.searchHelp(q, { limit }) as Hit[],
    topicTitle: (id: string) => (h.helpTopic(id)?.title as string | undefined) ?? '',
  }))
  return engine
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** The title with the words typed marked, for the eye to find them. */
export function marked(text: string, query: string): string {
  const words = [...new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 1))]
    .sort((a, b) => b.length - a.length)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return esc(text)
  const re = new RegExp(`(${words.join('|')})`, 'gi')
  return text.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('')
}

export const articleHref = (id: string) => `/help/${encodeURIComponent(id)}`
export const searchHref = (q: string) => `/help/search?q=${encodeURIComponent(q.trim())}`

const LIMIT = 6

/** A short placeholder on a narrow field, where the long one would be cut. */
function fitPlaceholder(input: HTMLInputElement) {
  const long = input.placeholder
  const short = input.dataset.placeholderShort
  if (!short) return
  const mq = window.matchMedia('(max-width: 479px)')
  const set = () => { input.placeholder = mq.matches ? short : long }
  mq.addEventListener('change', set)
  set()
}

/** The clear button shows while there's something to clear. */
function wireClear(form: HTMLFormElement, input: HTMLInputElement, onClear: () => void) {
  const clear = form.querySelector<HTMLButtonElement>('[data-hs-clear]')
  const sync = () => { if (clear) clear.hidden = !input.value }
  input.addEventListener('input', sync)
  clear?.addEventListener('click', () => {
    input.value = ''
    sync()
    onClear()
    input.focus()
  })
  sync()
  return sync
}

function initSuggest(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>('input[name="q"]')!
  const pop = form.querySelector<HTMLElement>('[data-hs-pop]')!
  const list = form.querySelector<HTMLElement>('[data-hs-list]')!
  const none = form.querySelector<HTMLElement>('[data-hs-none]')!
  const status = form.querySelector<HTMLElement>('[data-hs-status]')!
  const id = input.id
  let options: HTMLAnchorElement[] = []
  let active = -1
  let query = ''
  let run = 0

  const isOpen = () => !pop.hidden
  const open = () => {
    if (isOpen()) return
    pop.hidden = false
    void pop.offsetWidth
    pop.dataset.open = ''
    input.setAttribute('aria-expanded', 'true')
  }
  const close = () => {
    if (!isOpen()) return
    delete pop.dataset.open
    pop.hidden = true
    input.setAttribute('aria-expanded', 'false')
    setActive(-1)
  }
  const setActive = (i: number, scroll = false) => {
    if (active >= 0) options[active]?.setAttribute('aria-selected', 'false')
    active = i
    const o = options[i]
    if (o) {
      o.setAttribute('aria-selected', 'true')
      input.setAttribute('aria-activedescendant', o.id)
      if (scroll) o.scrollIntoView({ block: 'nearest' })
    } else {
      input.removeAttribute('aria-activedescendant')
    }
  }

  const render = async () => {
    const q = input.value.trim()
    const mine = ++run
    if (!q) { query = ''; list.innerHTML = ''; options = []; none.hidden = true; status.textContent = ''; close(); return }
    const { search, topicTitle } = await loadEngine()
    if (mine !== run) return
    query = q
    const hits = search(q, LIMIT)
    list.innerHTML = hits.map((h, i) => `
      <a role="option" id="${id}-opt-${i}" href="${articleHref(h.id)}" class="hs-opt" aria-selected="false" tabindex="-1">
        <span class="hs-opt-title">${marked(h.title, q)}</span>
        <span class="hs-opt-meta"><span class="hs-opt-topic">${esc(topicTitle(h.topic))}<span aria-hidden="true"> · </span></span>${esc(h.summary)}</span>
      </a>`).join('') + (hits.length ? `
      <a role="option" id="${id}-opt-all" href="${searchHref(q)}" class="hs-opt hs-all" aria-selected="false" tabindex="-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/></svg>
        <span>Show all results for “${esc(q)}”</span>
      </a>` : '')
    options = [...list.querySelectorAll<HTMLAnchorElement>('[role="option"]')]
    active = -1
    input.removeAttribute('aria-activedescendant')
    none.hidden = hits.length > 0
    none.innerHTML = hits.length ? '' : `Nothing matches “${esc(q)}”. Try fewer words, or <a href="/help#help-topics">browse the topics</a>.`
    status.textContent = hits.length
      ? `${hits.length} ${hits.length === 1 ? 'answer' : 'answers'}. Use the up and down arrows to choose one.`
      : 'No answers.'
    if (document.activeElement === input) open()
  }

  let queued = 0
  const schedule = () => { cancelAnimationFrame(queued); queued = requestAnimationFrame(() => { void render() }) }

  // Fetch the search the moment someone reaches for it.
  const warm = () => { void loadEngine() }
  form.addEventListener('pointerenter', warm, { once: true })
  input.addEventListener('focus', warm, { once: true })
  input.addEventListener('touchstart', warm, { once: true, passive: true })

  input.addEventListener('input', schedule)
  // Back in the field with words still in it: the list they found comes back.
  input.addEventListener('focus', () => {
    const q = input.value.trim()
    if (!q) return
    if (q === query) open()
    else schedule()
  })

  input.addEventListener('keydown', e => {
    const n = options.length
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen()) { if (input.value.trim()) { open(); if (query !== input.value.trim()) schedule() } return }
        if (n) setActive(active < 0 || active >= n - 1 ? 0 : active + 1, true)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!isOpen()) return
        if (n) setActive(active <= 0 ? n - 1 : active - 1, true)
        break
      case 'Enter': {
        const o = isOpen() ? options[active] : undefined
        if (o) { e.preventDefault(); window.location.href = o.href; return }
        if (!input.value.trim()) e.preventDefault()
        break
      }
      case 'Escape':
        if (isOpen()) { e.preventDefault(); close() }
        else if (input.value) { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input')) }
        break
    }
  })

  // Pressing an answer must not take focus from the field first, or the list
  // would close under the pointer before the click lands.
  pop.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('.hs-opt')) e.preventDefault() })
  list.addEventListener('pointermove', e => {
    const o = (e.target as HTMLElement).closest<HTMLAnchorElement>('.hs-opt')
    const i = o ? options.indexOf(o) : -1
    if (i >= 0 && i !== active) setActive(i)
  })
  form.addEventListener('focusout', e => {
    if (!form.contains(e.relatedTarget as Node | null)) close()
  })
  document.addEventListener('pointerdown', e => { if (!form.contains(e.target as Node)) close() })
  form.addEventListener('submit', e => {
    if (!input.value.trim()) e.preventDefault()
  })

  wireClear(form, input, () => { void render() })
  // Back from an article, the browser may have kept what was typed.
  if (input.value.trim()) void loadEngine()
}

export function initHelpSearch() {
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-help-search]')) {
    const input = form.querySelector<HTMLInputElement>('input[name="q"]')
    if (!input) continue
    fitPlaceholder(input)
    if (form.dataset.mode === 'suggest') initSuggest(form)
  }
}

export { wireClear }
