import StarterKit from '@tiptap/starter-kit'
import { BulletList, TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import Highlight from '@tiptap/extension-highlight'

/**
 * What a note can hold, which is what iOS Notes offers in its Aa panel: a
 * Title, a Heading, a Subheading and Body; Monostyled; bold, italic,
 * underline and strikethrough; bulleted, dashed and numbered lists; a
 * checklist; a quote; indenting; and highlight colours.
 *
 * ── The pieces ──
 *
 * StarterKit's blocks and marks, minus what a note has no use for: inline
 * code (Monostyled is a whole line, the code block), a horizontal rule, the
 * drop cursor - nothing is dragged into a note - and the empty paragraph it
 * keeps at the end of a document. Links are kept and made as you type or
 * paste them, but a tap does not open one: in a note a tap is to put the
 * caret there.
 *
 * The dashed list is a bulleted list with `kind: "dash"` on it, drawn with a
 * dash for its marker (index.css .note-doc). One list with a style rather
 * than a second kind of list, so switching between the two keeps every item
 * and its nesting exactly where it is.
 */

/** A bulleted list that can be drawn with dashes instead. */
export const NoteBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: {
        default: null,
        parseHTML: (/** @type {HTMLElement} */ el) => el.getAttribute('data-kind'),
        renderHTML: (/** @type {{kind?: string|null}} */ attrs) => (attrs.kind ? { 'data-kind': attrs.kind } : {}),
      },
    }
  },
})

/**
 * The highlight colours, iOS 18's five. Translucent, so the words stay the
 * page's own colour under them in either theme.
 */
export const HIGHLIGHTS = [
  { key: 'yellow', label: 'Yellow', color: 'rgba(250, 204, 21, 0.4)' },
  { key: 'pink',   label: 'Pink',   color: 'rgba(244, 114, 182, 0.34)' },
  { key: 'purple', label: 'Purple', color: 'rgba(167, 139, 250, 0.38)' },
  { key: 'mint',   label: 'Mint',   color: 'rgba(52, 211, 153, 0.34)' },
  { key: 'blue',   label: 'Blue',   color: 'rgba(96, 165, 250, 0.38)' },
]

export const NOTE_EXTENSIONS = [
  StarterKit.configure({
    bulletList: false,
    code: false,
    horizontalRule: false,
    dropcursor: false,
    /* No empty line kept at the end: a new note is its title line and
       nothing else, and the caret goes there - with one, it went into a
       blank paragraph under an empty title. */
    trailingNode: false,
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  NoteBulletList,
  TaskList,
  TaskItem.configure({
    nested: true,
    a11y: { checkboxLabel: (node, checked) => `${checked ? 'Done' : 'Not done'}: ${node.textContent || 'empty item'}` },
  }),
  Highlight.configure({ multicolor: true }),
  Placeholder.configure({
    // The first line only, and only while there is nothing on it.
    placeholder: ({ node, pos }) => (pos === 0 && node.type.name === 'heading' ? 'Title' : ''),
    showOnlyCurrent: false,
  }),
]
