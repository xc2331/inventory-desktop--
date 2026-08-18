/*
 * SearchBar.jsx
 * Search input, size slider, and card mode toggle.
 * Extracted from MaterialLibrary.jsx (lines 697-724).
 */
import { Search, SlidersHorizontal, LayoutGrid, Grid3x3 } from 'lucide-react'
import { cn } from '../../lib/cn'

export default function SearchBar({ keyword, setKeyword, cardSize, setCardSize, fileCardMode, setFileCardMode, view, t }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('materials_search')}
          className="input w-full pl-9 text-xs"
        />
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1">
        <SlidersHorizontal size={13} className="text-text-tertiary" />
        <input
          type="range"
          min={1}
          max={6}
          step={1}
          value={cardSize}
          onChange={(e) => setCardSize(Number(e.target.value))}
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          title={t('materials_sizeSlider')}
        />
        <span className="w-5 text-center text-[10px] text-text-tertiary">{cardSize}</span>
      </div>
      {view === 'file' && (
        <button
          type="button"
          onClick={() => setFileCardMode((m) => (m === 'rich' ? 'compact' : 'rich'))}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-smooth',
            fileCardMode === 'compact'
              ? 'border-primary/40 bg-primary-soft text-primary'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
          )}
          title={t('materials_cardMode')}
        >
          {fileCardMode === 'rich' ? <LayoutGrid size={14} /> : <Grid3x3 size={14} />}
          {fileCardMode === 'rich' ? t('materials_richCards') : t('materials_compactCards')}
        </button>
      )}
    </div>
  )
}