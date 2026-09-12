import { useState, useRef, useEffect } from 'react'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useScrollLock } from '../../hooks/useScrollLock'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'

// ── QR Crop Sheet ─────────────────────────────────────────────────────────────

export function QrCropSheet({ open, onClose, onConfirm, initialSrc = null }) {
  const [imgSrc,        setImgSrc]        = useState(null)
  const [crop,          setCrop]          = useState(null)
  const [completedCrop, setCompletedCrop] = useState(null)
  const imgRef    = useRef(null)
  const fileRef   = useRef(null)

  useEffect(() => {
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // The photo arrives as a prop now, so opening means "crop this".
    //
    // Guarded on `open`, like every other hydrate effect in this file: Sheet
    // renders for 240ms after open goes false, and the parent clears the
    // source in onClose, so clearing here as well swapped the photo for the
    // empty "Choose a photo" state during the slide-down.
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImgSrc(initialSrc ?? null)
    setCrop(null)
    setCompletedCrop(null)
  }, [open, initialSrc])

  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImgSrc(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function onImageLoad(e) {
    const img = e.currentTarget
    const dw = img.width   // display (CSS) pixels
    const dh = img.height
    const aspect = 5 / 7
    let w, h
    if (dw / dh > aspect) { h = dh; w = h * aspect }
    else { w = dw; h = w / aspect }
    const x = (dw - w) / 2
    const y = (dh - h) / 2
    const initial = { unit: 'px', x, y, width: w, height: h }
    setCrop(initial)
    setCompletedCrop(initial)
  }

  function handleConfirm() {
    if (!completedCrop || !imgRef.current) return
    const img = imgRef.current
    const scaleX = img.naturalWidth  / img.width
    const scaleY = img.naturalHeight / img.height
    const canvas = document.createElement('canvas')
    canvas.width  = 500
    canvas.height = 700
    const ctx = canvas.getContext('2d')
    ctx.drawImage(
      img,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, 500, 700,
    )
    onConfirm(canvas.toDataURL('image/jpeg', 0.82))
    onClose()
  }

  /* The actions are Sheet's footer, so they stay reachable no matter how tall
     the photo is. The header's Cancel went with the migration: it only ever
     called close, which the scrim, Escape and the handle all do now. */
  const actions = !imgSrc ? (
    <div className="flex gap-3">
      <Button className="flex-1" onClick={() => fileRef.current?.click()}>
        Choose photo
      </Button>
    </div>
  ) : (
    <div className="flex gap-3">
      {/* Straight back to the picker. Clearing to the empty state
          meant picking the wrong screenshot cost two taps to fix -
          one to empty it, one to ask again. */}
      <Button
        variant="secondary"
        className="flex-1"
        onClick={() => fileRef.current?.click()}
      >
        Change
      </Button>
      <Button className="flex-[2]" onClick={handleConfirm} disabled={!completedCrop}>
        Use photo
      </Button>
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={150}
      scrim={60}
      title="Crop QR Photo"
      maxHeight="92dvh"
      footer={actions}
    >
      {imgSrc && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Drag the box over the code
        </p>
      )}

      <div className="flex flex-col items-center justify-center py-6 gap-5">
        {!imgSrc ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-3 py-12 rounded-3xl
              border-2 border-dashed border-slate-200 dark:border-white/10
              text-slate-400 dark:text-slate-500
              active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            <p className="text-sm font-medium">Choose a photo</p>
            <p className="text-xs">Select a screenshot containing your QR code</p>
          </button>
        ) : (
          <div className="w-full flex items-center justify-center" style={{ touchAction: 'none' }}>
            <ReactCrop
              crop={crop}
              onChange={c => setCrop(c)}
              onComplete={c => setCompletedCrop(c)}
              aspect={5 / 7}
              keepSelection
            >
              <img
                ref={imgRef}
                src={imgSrc}
                alt="QR source"
                onLoad={onImageLoad}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  // Cap image to available space: sheet is 92dvh, header ~100px, footer ~84px, body padding 48px
                  maxHeight: 'calc(92dvh - 232px)',
                  objectFit: 'contain',
                }}
              />
            </ReactCrop>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
    </Sheet>
  )
}

// ── QR Viewer Modal ────────────────────────────────────────────────────────────

export function QrViewerModal({ open, onClose, qrImage, accountName }) {
  useScrollLock(open)
  if (!open) return null
  return (
    /* design-ok: a lightbox, not a sheet. There is no panel - the image sits
       on full black and a tap anywhere closes it. */
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90"
      style={{ touchAction: 'none' }}
      onClick={onClose}
    >
      <p className="text-white/60 text-xs font-semibold mb-5">
        {accountName}
      </p>
      <img
        src={qrImage}
        alt="Payment QR"
        className="w-full max-w-sm rounded-3xl shadow-2xl"
        style={{ aspectRatio: '5/7', objectFit: 'cover' }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="mt-8 px-8 py-3 rounded-full text-sm font-semibold text-white
          bg-white/10 active:bg-white/20 transition-colors"
      >
        Done
      </button>
    </div>
  )
}
