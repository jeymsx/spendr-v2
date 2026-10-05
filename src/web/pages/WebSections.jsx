import { Navigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { Empty } from '../ui/display'
import { INote } from '../ui/icons'

/**
 * What the note card shows before a note is picked (pages/WebNotes).
 */

/** Opens the newest note - a pinned one first - as a mail app opens the first message. */
export function NotesIndex() {
  const first = useLiveQuery(async () => {
    const all = await db.notes.orderBy('editedAt').reverse().toArray()
    const live = all.filter(n => !n.deletedAt && (n.text ?? '').trim())
    return live.find(n => n.pinned) ?? live[0] ?? false
  }, [], undefined)
  if (first === undefined) return null
  // None at all: the list says so itself, and the card says what goes in it.
  if (!first) return <Empty icon={<INote size={20} />} title="No note open" body="Pick one from the list, or start a new one." />
  return <Navigate to={`/notes/${first.id}`} replace />
}
