import { useEditorState } from '@tiptap/react'
import { cx } from '../../components/ui/cx'
import { HIGHLIGHTS } from './extensions'
import {
  IconBold, IconItalic, IconUnderline, IconStrike, IconBullets, IconDashes, IconNumbered,
  IconChecklist, IconIndent, IconOutdent, IconQuote, IconUndo, IconRedo,
} from './icons'

/**
 * What a note's words can be made: its paragraph styles, its marks, its
 * lists, a quote, indenting and highlight - the controls of iOS Notes' Aa
 * panel, in the same order.
 *
 * ── Two places, one set ──
 *
 * On a phone they are the Aa panel, which takes the keyboard's place, so
 * nothing here moves focus: the panel works on the selection the editor
 * holds while the keyboard is down, and the keyboard comes back when the
 * panel goes (NoteEditor). On a computer they are a bar above the note,
 * where the editor keeps its focus while you click - every button refuses
 * the mouse-down that would take it.
 *
 * What is on shows as on, read from the editor on every change
 * (useEditorState), and what cannot apply here - bold inside Monostyled,
 * indenting outside a list - is disabled rather than silently doing nothing.
 */

/** @typedef {import('@tiptap/react').Editor} Editor */

/** @param {Editor} editor */
export function useFormatState(editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null
      const dash = e.isActive('bulletList', { kind: 'dash' })
      const task = e.isActive('taskList')
      const item = task ? 'taskItem' : 'listItem'
      return {
        title: e.isActive('heading', { level: 1 }),
        heading: e.isActive('heading', { level: 2 }),
        sub: e.isActive('heading', { level: 3 }),
        mono: e.isActive('codeBlock'),
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        canMark: e.can().toggleBold(),
        bullet: e.isActive('bulletList') && !dash,
        dash,
        ordered: e.isActive('orderedList'),
        task,
        quote: e.isActive('blockquote'),
        canSink: e.can().sinkListItem(item),
        canLift: e.isActive('listItem') || e.isActive('taskItem') ? e.can().liftListItem(item) : false,
        highlight: /** @type {string|null} */ (e.getAttributes('highlight').color ?? null),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        item,
      }
    },
  })
}

/**
 * The commands, one per control. `focus`: put the caret back in the note
 * as well - on a computer, where it never left; not on a phone, where the
 * panel is up and the keyboard down.
 *
 * @param {Editor} editor
 * @param {ReturnType<typeof useFormatState>} st
 * @param {boolean} focus
 */
export function formatCommands(editor, st, focus) {
  /** @param {(c: any) => any} step */
  const run = (step) => {
    let chain = editor.chain()
    if (focus) chain = chain.focus()
    step(chain).run()
  }
  const s = st ?? /** @type {any} */ ({})
  return {
    title: () => run(c => (s.title ? c.setParagraph() : c.clearNodes().setHeading({ level: 1 }))),
    heading: () => run(c => (s.heading ? c.setParagraph() : c.clearNodes().setHeading({ level: 2 }))),
    sub: () => run(c => (s.sub ? c.setParagraph() : c.clearNodes().setHeading({ level: 3 }))),
    body: () => run(c => c.clearNodes()),
    mono: () => run(c => (s.mono ? c.setParagraph() : c.clearNodes().setCodeBlock())),
    bold: () => run(c => c.toggleBold()),
    italic: () => run(c => c.toggleItalic()),
    underline: () => run(c => c.toggleUnderline()),
    strike: () => run(c => c.toggleStrike()),
    bullet: () => run(c => (s.dash ? c.updateAttributes('bulletList', { kind: null }) : c.toggleBulletList())),
    dash: () => run(c => (s.dash ? c.toggleBulletList()
      : s.bullet ? c.updateAttributes('bulletList', { kind: 'dash' })
        : c.toggleBulletList().updateAttributes('bulletList', { kind: 'dash' }))),
    ordered: () => run(c => c.toggleOrderedList()),
    task: () => run(c => c.toggleTaskList()),
    quote: () => run(c => c.toggleBlockquote()),
    indent: () => run(c => c.sinkListItem(s.item ?? 'listItem')),
    outdent: () => run(c => c.liftListItem(s.item ?? 'listItem')),
    /** @param {string|null} color */
    highlight: (color) => run(c => (color ? c.setHighlight({ color }) : c.unsetHighlight())),
    undo: () => run(c => c.undo()),
    redo: () => run(c => c.redo()),
  }
}

/**
 * A button that never takes the focus from the note.
 *
 * The mouse-down is refused, not the pointer-down: that is the event whose
 * default moves the focus, on a computer and on an iPhone alike (iOS sends it
 * after the touch ends). Refusing the pointer-down instead cost WebKit the
 * tap itself - a touch whose pointer-down was cancelled never became a click,
 * and the note's buttons did nothing in Safari's engine.
 */
export function NoteButton({ label, active = false, disabled = false, onPress, className = '', children }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={onPress}
      className={cx(
        'press press-icon shrink-0 flex items-center justify-center rounded-xl transition-colors duration-150',
        'disabled:opacity-35 disabled:active:scale-100',
        active
          ? 'bg-primary/[0.12] accent-ink dark:bg-primary/[0.22]'
          : 'text-slate-600 dark:text-slate-300 enabled:active:bg-slate-100 dark:enabled:active:bg-white/[0.08]',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * The Aa panel's body, and the desktop's bar.
 *
 * @param {{editor: Editor, layout: 'panel'|'bar'}} props
 */
export default function FormatControls({ editor, layout }) {
  const st = useFormatState(editor)
  const cmd = formatCommands(editor, st, layout === 'bar')
  if (!st) return null

  const STYLES = [
    { key: 'title', label: 'Title', on: st.title, cls: 'text-17 font-bold', run: cmd.title },
    { key: 'heading', label: 'Heading', on: st.heading, cls: 'text-15 font-bold', run: cmd.heading },
    { key: 'sub', label: 'Subheading', on: st.sub, cls: 'text-14 font-semibold', run: cmd.sub },
    { key: 'body', label: 'Body', on: !st.title && !st.heading && !st.sub && !st.mono, cls: 'text-14', run: cmd.body },
    { key: 'mono', label: 'Monostyled', on: st.mono, cls: 'text-13 font-mono', run: cmd.mono },
  ]
  const MARKS = [
    { key: 'bold', label: 'Bold', on: st.bold, Icon: IconBold, run: cmd.bold },
    { key: 'italic', label: 'Italic', on: st.italic, Icon: IconItalic, run: cmd.italic },
    { key: 'underline', label: 'Underline', on: st.underline, Icon: IconUnderline, run: cmd.underline },
    { key: 'strike', label: 'Strikethrough', on: st.strike, Icon: IconStrike, run: cmd.strike },
  ]
  const LISTS = [
    { key: 'bullet', label: 'Bulleted list', on: st.bullet, Icon: IconBullets, run: cmd.bullet },
    { key: 'dash', label: 'Dashed list', on: st.dash, Icon: IconDashes, run: cmd.dash },
    { key: 'ordered', label: 'Numbered list', on: st.ordered, Icon: IconNumbered, run: cmd.ordered },
    { key: 'task', label: 'Checklist', on: st.task, Icon: IconChecklist, run: cmd.task },
  ]

  const swatches = (
    <div className="flex items-center gap-2" role="group" aria-label="Highlight">
      <button
        type="button"
        aria-label="No highlight"
        aria-pressed={!st.highlight}
        onMouseDown={e => e.preventDefault()}
        onClick={() => cmd.highlight(null)}
        className={cx('press press-icon w-7 h-7 rounded-full shrink-0 border flex items-center justify-center',
          'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500',
          !st.highlight && 'ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-[#111820]')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 19 19 5" /></svg>
      </button>
      {HIGHLIGHTS.map(h => (
        <button
          key={h.key}
          type="button"
          aria-label={`${h.label} highlight`}
          aria-pressed={st.highlight === h.color}
          onMouseDown={e => e.preventDefault()}
          onClick={() => cmd.highlight(st.highlight === h.color ? null : h.color)}
          disabled={!st.canMark}
          className={cx('press press-icon w-7 h-7 rounded-full shrink-0 disabled:opacity-35',
            st.highlight === h.color && 'ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-[#111820]')}
          style={{ background: h.color.replace(/[\d.]+\)$/, '0.85)') }}
        />
      ))}
    </div>
  )

  if (layout === 'bar') {
    return (
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Formatting">
        <select
          aria-label="Paragraph style"
          value={STYLES.find(x => x.on)?.key ?? 'body'}
          onChange={e => STYLES.find(x => x.key === e.target.value)?.run()}
          className="h-9 pl-3 pr-8 rounded-xl text-13 font-medium bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-200 border-0 outline-none"
        >
          {STYLES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <span className="w-px h-6 mx-1 bg-slate-200 dark:bg-white/[0.1]" aria-hidden="true" />
        {MARKS.map(m => (
          <NoteButton key={m.key} label={m.label} active={m.on} disabled={!st.canMark} onPress={m.run} className="w-9 h-9">
            <m.Icon size={18} />
          </NoteButton>
        ))}
        <span className="w-px h-6 mx-1 bg-slate-200 dark:bg-white/[0.1]" aria-hidden="true" />
        {LISTS.map(m => (
          <NoteButton key={m.key} label={m.label} active={m.on} onPress={m.run} className="w-9 h-9">
            <m.Icon size={18} />
          </NoteButton>
        ))}
        <NoteButton label="Outdent" disabled={!st.canLift} onPress={cmd.outdent} className="w-9 h-9"><IconOutdent size={18} /></NoteButton>
        <NoteButton label="Indent" disabled={!st.canSink} onPress={cmd.indent} className="w-9 h-9"><IconIndent size={18} /></NoteButton>
        <NoteButton label="Quote" active={st.quote} onPress={cmd.quote} className="w-9 h-9"><IconQuote size={18} /></NoteButton>
        <span className="w-px h-6 mx-1 bg-slate-200 dark:bg-white/[0.1]" aria-hidden="true" />
        {swatches}
        <span className="flex-1" />
        <NoteButton label="Undo" disabled={!st.canUndo} onPress={cmd.undo} className="w-9 h-9"><IconUndo size={18} /></NoteButton>
        <NoteButton label="Redo" disabled={!st.canRedo} onPress={cmd.redo} className="w-9 h-9"><IconRedo size={18} /></NoteButton>
      </div>
    )
  }

  // The phone's panel: a row of styles, each drawn as itself, then the rest.
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="group" aria-label="Paragraph style">
        {STYLES.map(x => (
          <button
            key={x.key}
            type="button"
            aria-pressed={x.on}
            onMouseDown={e => e.preventDefault()}
            onClick={x.run}
            className={cx('press press-fade shrink-0 h-10 px-3.5 rounded-xl transition-colors duration-150',
              x.cls,
              x.on
                ? 'bg-primary/[0.14] accent-ink dark:bg-primary/[0.24]'
                : 'bg-slate-100 text-slate-700 dark:bg-white/[0.07] dark:text-slate-200')}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="flex-1 flex rounded-xl bg-slate-100 dark:bg-white/[0.07] p-0.5" role="group" aria-label="Text style">
          {MARKS.map(m => (
            <NoteButton key={m.key} label={m.label} active={m.on} disabled={!st.canMark} onPress={m.run} className="flex-1 h-10">
              <m.Icon size={19} />
            </NoteButton>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 flex rounded-xl bg-slate-100 dark:bg-white/[0.07] p-0.5" role="group" aria-label="Lists">
          {LISTS.map(m => (
            <NoteButton key={m.key} label={m.label} active={m.on} onPress={m.run} className="flex-1 h-10">
              <m.Icon size={19} />
            </NoteButton>
          ))}
        </div>
        <div className="flex rounded-xl bg-slate-100 dark:bg-white/[0.07] p-0.5" role="group" aria-label="Indent">
          <NoteButton label="Outdent" disabled={!st.canLift} onPress={cmd.outdent} className="w-11 h-10"><IconOutdent size={19} /></NoteButton>
          <NoteButton label="Indent" disabled={!st.canSink} onPress={cmd.indent} className="w-11 h-10"><IconIndent size={19} /></NoteButton>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        {swatches}
        <div className="flex rounded-xl bg-slate-100 dark:bg-white/[0.07] p-0.5">
          <NoteButton label="Quote" active={st.quote} onPress={cmd.quote} className="w-11 h-10">
            <IconQuote size={19} />
          </NoteButton>
        </div>
      </div>
    </div>
  )
}
