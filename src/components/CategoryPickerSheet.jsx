import Sheet from './ui/Sheet'
import CategoryGlyph from './CategoryGlyph'

export default function CategoryPickerSheet({ open, onClose, categories, selected, onSelect }) {
  const pick = (cat) => { onSelect(cat); onClose() }

  return (
    /* 78dvh: a four-column grid of every expense category is the longest
       list in the app, so this is where a short sheet forced the most
       scrolling. Sheet's feathered, scrolling body and the grab handle are
       its own now - this file used to build both. */
    <Sheet
      open={open}
      onClose={onClose}
      z={130}
      scrim={40}
      maxHeight="78dvh"
      title="Select category"
    >
      <div>
        <div className="grid grid-cols-4 gap-2.5">
            {categories.map(cat => {
              const isSelected = selected?.id === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => pick(cat)}
                  className={[
                    'flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-2xl',
                    'active:scale-[0.95] transition-all duration-75',
                    isSelected
                      ? 'ring-2 ring-primary/50 bg-primary/8 dark:bg-primary/15'
                      : 'bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.09]',
                  ].join(' ')}
                >
                  <span className="leading-none"><CategoryGlyph cat={cat} size={24} /></span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 text-center leading-tight">
                    {cat.name}
                  </span>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              )
            })}
        </div>
      </div>
    </Sheet>
  )
}
