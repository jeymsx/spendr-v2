import { useEffect, useState } from 'react'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import MoneyField from '../../components/ui/MoneyField'
import { saveFloor } from '../../hooks/useForecast'
import { useToast } from '../../context/ToastContext'
import { moneyChangeHandler, numToMoneyStr, parseMoney } from '../../utils/moneyInput'

/**
 * The floor: the balance you do not want to go below. The forecast warns
 * the day it would, and "safe to spend" leaves it untouched. Zero means none.
 *
 * Opened from the Forecast page and from its settings, so it lives here
 * rather than inside either.
 *
 * @param {{open: boolean, onClose: () => void, floor: number, currency: string}} props
 */
export default function FloorSheet({ open, onClose, floor, currency }) {
  const { showToast } = useToast()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(floor > 0 ? numToMoneyStr(floor) : '')
  }, [open, floor])

  const save = async () => {
    setSaving(true)
    try {
      await saveFloor(parseMoney(value) || 0)
      onClose()
      showToast(parseMoney(value) > 0 ? 'Floor saved' : 'Floor removed')
    } catch (e) {
      console.error('[Forecast] floor save failed:', e)
      showToast('Could not save the floor', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="Floor"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-[2]" onClick={save} loading={saving} disabled={saving}>Save</Button>
        </div>
      }
    >
      <p className="text-13 text-slate-500 dark:text-slate-400 mb-4">
        The least you want to keep in cash and banks. The forecast warns you before you dip
        below it. Leave it empty for none.
      </p>
      <MoneyField value={value} onChange={moneyChangeHandler(setValue)} currency={currency} />
    </Sheet>
  )
}
