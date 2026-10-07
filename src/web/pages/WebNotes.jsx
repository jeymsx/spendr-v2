import { lazy, Suspense, useState } from 'react'
import { NoteListSkeleton, NoteEditorSkeleton } from '../ui/Skeletons'
import { Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { createNote } from '../../lib/notes'
import { useFolders } from '../../pages/notes/NoteFiling'
import { NotesViewSheet } from '../../pages/notes/NoteFiling'
import { useNotesPrefs } from '../../pages/notes/notesPrefs'
import { filingOf, screenOf, useNotesView } from '../../pages/notes/notesView'
import Page from '../ui/Page'
import Btn from '../ui/Button'
import { IPlus, ISliders } from '../ui/icons'

const Notes = lazy(() => import('../../pages/Notes'))

/**
 * Notes on a computer: the list at the left, the note open beside it in a
 * card of its own, as the Mac's Notes has them - in the frame every other
 * page has, its title and New note at the top.
 *
 * The list and the editor are the phone's own (pages/Notes, notes/NoteEditor):
 * the list's own header gives way to the page's (pro.css `.d-twopane-side`),
 * and the note open in it is ringed as a table's open row is.
 */
export default function WebNotes() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const id = matchPath('/notes/:id', pathname)?.params?.id ?? null
  const [view] = useNotesView()
  const [prefs] = useNotesPrefs()
  const folders = useFolders()
  const [viewing, setViewing] = useState(false)
  // The open folder, if it is still there: a note is not started in one that is gone.
  const open = (folders ?? []).some(f => f.syncId === view.folder) ? view.folder : 'all'
  const compose = async () => {
    const nid = await createNote(undefined, filingOf({ folder: open, tag: view.tag }, screenOf(view, prefs)))
    navigate(`/notes/${nid}`, { state: { fresh: true } })
  }
  return (
    <Page
      title="Notes"
      scrollKey="/notes"
      actions={(
        <>
          <Btn variant="ghost" icon={<ISliders size={16} />} label="Notes view" onClick={() => setViewing(true)} />
          <Btn variant="primary" icon={<IPlus size={15} />} onClick={compose}>New note</Btn>
        </>
      )}
    >
      <NotesViewSheet open={viewing} onClose={() => setViewing(false)} />
      {id && id !== 'deleted' && (
        <style>{`.d-twopane-side [data-web-id="note-${String(id).replace(/["\\]/g, '')}"]{border-radius:16px;box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 70%, transparent);background-color:rgba(var(--color-primary-rgb),0.08)}`}</style>
      )}
      <div className="d-twopane d-notes" style={{ '--side': '300px' }}>
        <div className="d-twopane-side d-twopane-list min-w-0">
          <Suspense fallback={<NoteListSkeleton />}><Notes /></Suspense>
        </div>
        <div className="d-twopane-main d-panel d-note-card min-w-0">
          <Suspense fallback={<NoteEditorSkeleton />}><Outlet /></Suspense>
        </div>
      </div>
    </Page>
  )
}
