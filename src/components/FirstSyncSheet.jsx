import Sheet from './ui/Sheet'
import Button from './ui/Button'
import { IconCloud } from './icons'
import { firstSyncCopy } from '../lib/firstSync'

/**
 * The question a device's first sync with an account asks - see
 * lib/firstSync.js for why it asks at all.
 *
 * Not dismissible: until it is answered nothing syncs, and a scrim tap that
 * quietly left it that way would look like sync working. Signing out is the
 * way out that changes nothing.
 *
 * @param {{
 *   info: import('../lib/sync').FirstSyncInfo|null,
 *   busy: import('../lib/sync').FirstSyncChoice|null,
 *   onChoose: (choice: import('../lib/sync').FirstSyncChoice) => void,
 *   onSignOut: () => void,
 * }} props
 */
export default function FirstSyncSheet({ info, busy, onChoose, onSignOut }) {
  const copy = info ? firstSyncCopy(info) : null

  return (
    <Sheet
      open={!!info}
      onClose={() => {}}
      dismissible={false}
      handle={false}
      /* Above What's New (400), which a fresh setup also opens. Nothing else
         should be answered first. */
      z={450}
      scrim={60}
      ariaLabel={copy?.title ?? 'This account already has data'}
      footer={copy && (
        <div className="space-y-3">
          <div>
            <Button block loading={busy === 'account'} disabled={!!busy} onClick={() => onChoose('account')}>
              {copy.accountLabel}
            </Button>
            <p className="mt-1.5 text-center text-12 text-slate-500 dark:text-slate-400">{copy.account}</p>
          </div>
          {copy.both && (
            <div>
              <Button block variant="secondary" loading={busy === 'both'} disabled={!!busy} onClick={() => onChoose('both')}>
                {copy.bothLabel}
              </Button>
              <p className="mt-1.5 text-center text-12 text-slate-500 dark:text-slate-400">{copy.both}</p>
            </div>
          )}
          <Button block variant="quiet" size="sm" disabled={!!busy} onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      )}
    >
      {copy && (
        <div className="pt-6 space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 dark:bg-primary/15
            flex items-center justify-center mx-auto text-primary">
            <IconCloud size={26} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{copy.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{copy.body}</p>
          </div>
        </div>
      )}
    </Sheet>
  )
}
