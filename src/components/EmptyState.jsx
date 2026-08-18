import { Plus, Search, PackageOpen, Box } from 'lucide-react'

/**
 * Shared empty-state block used across views.
 *
 * Supports two calling styles:
 *  1. Explicit props (preferred for new usages):
 *       <EmptyState icon={...} title={t('...')} subtitle={t('...')} action={...} />
 *  2. Legacy App.jsx props (kept for backwards compatibility):
 *       <EmptyState onAdd={...} hasFilter={...} t={t} />
 */
export default function EmptyState({
  icon,
  title,
  subtitle,
  action,
  className,
  // Legacy props used by App.jsx
  onAdd,
  hasFilter,
  t
}) {
  if (onAdd !== undefined) {
    return (
      <EmptyStateLegacy
        onAdd={onAdd}
        hasFilter={hasFilter}
        className={className}
        t={t}
      />
    )
  }

  const Icon = icon || Box
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface/60 text-text-tertiary"
      >
        <Icon size={28} />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-base font-semibold text-text-primary">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs leading-relaxed text-text-tertiary">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

function EmptyStateLegacy({ onAdd, hasFilter, className, t }) {
  const Icon = hasFilter ? Search : PackageOpen
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface/60 text-text-tertiary"
      >
        <Icon size={28} />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-base font-semibold text-text-primary">
          {hasFilter ? t('empty_noMatch') : t('empty_noItems')}
        </h3>
        <p className="text-xs leading-relaxed text-text-tertiary">
          {hasFilter ? t('empty_tryFilter') : t('empty_addFirst')}
        </p>
      </div>
      {!hasFilter && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-1 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
        >
          <Plus size={15} strokeWidth={2.5} />
          {t('btn_add')}
        </button>
      )}
    </div>
  )
}

function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}