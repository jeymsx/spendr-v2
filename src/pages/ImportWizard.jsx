import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import Divider from '../components/ui/Divider'
import { IconArrowLeft, IconSuccess, StepDots } from './import/shared'
import { StepFilePicker } from './import/StepFilePicker'
import { StepPreview, StepOpeningBalances } from './import/StepPreview'
import { StepConfirm } from './import/StepConfirm'

// ── Step 4: Success ────────────────────────────────────────────────────────────

function StepSuccess({ imported, skipped, onImportAnother }) {
  const navigate = useNavigate()

  return (
    <div className="px-5 pt-8 pb-6 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-500/15
        flex items-center justify-center text-emerald-500 dark:text-emerald-400 mb-5">
        <IconSuccess />
      </div>

      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1.5">Import complete</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-8">
        Everything is in, and your balances are already up to date.
      </p>

      {/* Result cards */}
      <div className="w-full grid grid-cols-2 gap-3 mb-8">
        <div className="px-4 py-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/[0.08]
          border border-emerald-100 dark:border-emerald-500/20">
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{imported}</p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-0.5 font-medium">Imported</p>
        </div>
        <div className="px-4 py-4 rounded-2xl bg-slate-50 dark:bg-white/[0.04]
          border border-slate-100 dark:border-white/[0.07]">
          <p className="text-2xl font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{skipped}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">Skipped (dupes)</p>
        </div>
      </div>

      <div className="w-full space-y-3">
        <Button block onClick={() => navigate('/')}>
          Go to dashboard
        </Button>
        <Button variant="secondary" block onClick={onImportAnother}>
          Import another file
        </Button>
      </div>
    </div>
  )
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export default function ImportWizard() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromOnboarding = location.state?.from === 'onboarding'
  const [step,            setStep]            = useState(1)
  const [rows,            setRows]            = useState(null)
  const [isLegacy,        setIsLegacy]        = useState(false)
  const [fileName,        setFileName]        = useState('')
  const [fileSize,        setFileSize]        = useState(0)
  const [openingBalances, setOpeningBalances] = useState({})
  const [creditLimits,    setCreditLimits]    = useState({})
  const [imported,        setImported]        = useState(0)
  const [skipped,         setSkipped]         = useState(0)

  function handleParsed(parsedRows, legacy, name, size) {
    setRows(parsedRows)
    setIsLegacy(legacy)
    setFileName(name)
    setFileSize(size)
    setStep(2)
  }

  function handleOpeningBalances({ balances, creditLimits: limits }) {
    setOpeningBalances(balances)
    setCreditLimits(limits)
    setStep(4)
  }

  function handleDone(importedCount, skippedCount) {
    setImported(importedCount)
    setSkipped(skippedCount)
    setStep(5)
  }

  function reset() {
    setRows(null)
    setIsLegacy(false)
    setFileName('')
    setFileSize(0)
    setOpeningBalances({})
    setCreditLimits({})
    setStep(1)
  }

  const STEP_LABELS = {
    1: 'Select File',
    2: 'Preview & Validate',
    3: 'Opening Balances',
    4: 'Confirm Import',
    5: 'Done',
  }

  return (
    <div className="page-enter min-h-screen pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-page">
        <div className="flex items-center gap-3 px-5 pt-safe-header pb-3">
          <IconButton
            label={step === 1 || step === 5 ? 'Leave the importer' : 'Back to the previous step'}
            onClick={() => {
              if (step === 1 || step === 5) navigate(fromOnboarding ? '/' : '/settings')
              else setStep(s => s - 1)
            }}
          >
            <IconArrowLeft />
          </IconButton>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              {step < 5 ? `Step ${step} of 4` : 'Complete'}
            </p>
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {STEP_LABELS[step]}
            </h1>
          </div>
        </div>
        <div className="px-4 pb-3">
          <StepDots step={step} />
        </div>
        <Divider />
      </div>

      {/* Steps */}
      {step === 1 && (
        <StepFilePicker onParsed={handleParsed} />
      )}
      {step === 2 && rows && (
        <StepPreview
          rows={rows}
          isLegacy={isLegacy}
          fileName={fileName}
          fileSize={fileSize}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && rows && (
        <StepOpeningBalances
          rows={rows}
          onBack={() => setStep(2)}
          onNext={handleOpeningBalances}
        />
      )}
      {step === 4 && rows && (
        <StepConfirm
          rows={rows}
          openingBalances={openingBalances}
          creditLimits={creditLimits}
          onBack={() => setStep(3)}
          onDone={handleDone}
        />
      )}
      {step === 5 && (
        <StepSuccess
          imported={imported}
          skipped={skipped}
          onImportAnother={reset}
        />
      )}
    </div>
  )
}
