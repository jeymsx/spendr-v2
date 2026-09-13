import { useState, useRef, useCallback } from 'react'
import Card from '../../components/ui/Card'
import SectionLabel from '../../components/ui/SectionLabel'
import { IconUpload } from '../../components/icons'
import { IconWarning, NEW_REQUIRED_COLS } from './shared'
import { parseCSV } from './csv'

// ── Step 1: File picker ────────────────────────────────────────────────────────

export function StepFilePicker({ onParsed }) {
  const inputRef    = useRef(null)
  const [dragging, setDragging]   = useState(false)
  const [error,    setError]      = useState(null)
  const [loading,  setLoading]    = useState(false)

  const processFile = useCallback((file) => {
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setError('Invalid file type — only .csv files are accepted.')
      return
    }
    setError(null)
    setLoading(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const { rows, isLegacy } = parseCSV(e.target.result)
        if (rows.length === 0) {
          setError('The CSV file is empty — no data rows found.')
          setLoading(false)
          return
        }
        onParsed(rows, isLegacy, file.name, file.size)
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file.')
      setLoading(false)
    }
    reader.readAsText(file)
  }, [onParsed])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files[0])
  }, [processFile])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  const onFileChange = useCallback((e) => {
    processFile(e.target.files[0])
    e.target.value = ''
  }, [processFile])

  return (
    <div className="px-5 pt-4 pb-6">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Import data</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Import transactions from a Spendr CSV export.
      </p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !loading && inputRef.current?.click()}
        className={[
          'relative flex flex-col items-center justify-center gap-3',
          'min-h-[220px] rounded-3xl border-2 border-dashed cursor-pointer',
          'transition-all duration-200 select-none',
          dragging
            ? 'border-primary bg-primary/[0.06] scale-[1.01]'
            : 'border-slate-200 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.03]',
          'active:scale-[0.99]',
        ].join(' ')}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Parsing…</p>
          </div>
        ) : (
          <>
            <div className={`${dragging ? 'text-primary' : 'text-slate-300 dark:text-slate-600'} transition-colors duration-200`}>
              <IconUpload size={32} strokeWidth="1.5" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {dragging ? 'Drop it here' : 'Drag & drop your CSV'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                or tap to browse
              </p>
            </div>
            <span className="text-11 font-medium px-3 py-1 rounded-full
              bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500">
              .csv only
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={onFileChange}
          className="absolute inset-0 opacity-0 pointer-events-none"
          tabIndex={-1}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-3 px-4 py-3.5 rounded-2xl
          bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
          <span className="text-red-500 dark:text-red-400 shrink-0 mt-0.5"><IconWarning /></span>
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Format reference */}
      <Card padding="md" className="mt-5">
        <SectionLabel>Expected columns</SectionLabel>
        <p className="text-11 text-slate-500 dark:text-slate-400 font-mono leading-relaxed break-all">
          {NEW_REQUIRED_COLS.join(', ')}
        </p>
        <p className="text-11 text-slate-400 dark:text-slate-500 mt-2">
          Legacy format (txId, date, payment, account…) is also accepted.
        </p>
      </Card>
    </div>
  )
}
