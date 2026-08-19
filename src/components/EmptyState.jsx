import { Plus, Search, PackageOpen, Box } from 'lucide-react'
import { motion } from 'framer-motion'

/**
 * UX-04 空状态插画：带入场动画 + 装饰光晕背景 + 引导 CTA
 *
 * 两种调用方式：
 *  1. Explicit: <EmptyState icon={...} title={...} subtitle={...} action={...} />
 *  2. Legacy: <EmptyState onAdd={...} hasFilter={...} t={t} />
 */
export default function EmptyState({
  icon,
  title,
  subtitle,
  action,
  className,
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-4 px-6 py-14 text-center overflow-hidden',
        className
      )}
    >
      {/* UX-04 背景光晕装饰 */}
      <div className="pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-primary/4 blur-3xl" />

      <IllustratedIcon Icon={Icon} />

      <div className="max-w-md space-y-1.5">
        <h3 className="text-lg font-semibold text-text-primary">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm leading-relaxed text-text-tertiary">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  )
}

function IllustratedIcon({ Icon }) {
  return (
    <div className="relative">
      {/* 外圈光环 */}
      <motion.div
        initial={false}
        animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/12 to-transparent blur-lg"
        style={{ padding: '12px' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1], delay: 0.15 }}
        className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-border/60 bg-surface/80 backdrop-blur-sm shadow-card text-text-tertiary"
      >
        <Icon size={32} />
      </motion.div>
    </div>
  )
}

function EmptyStateLegacy({ onAdd, hasFilter, className, t }) {
  const Icon = hasFilter ? Search : PackageOpen
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-4 px-6 py-14 text-center overflow-hidden',
        className
      )}
    >
      <div className="pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-primary/4 blur-3xl" />

      <IllustratedIcon Icon={Icon} />

      <div className="max-w-md space-y-1.5">
        <h3 className="text-lg font-semibold text-text-primary">
          {hasFilter ? t('empty_noMatch') : t('empty_noItems')}
        </h3>
        <p className="text-sm leading-relaxed text-text-tertiary">
          {hasFilter ? t('empty_tryFilter') : t('empty_addFirst')}
        </p>
      </div>
      {!hasFilter && (
        <motion.button
          type="button"
          onClick={onAdd}
          whileHover={{ scale: 1.04, y: -2 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="mt-2 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/20 hover:bg-primary-hover"
        >
          <Plus size={16} strokeWidth={2.5} />
          {t('btn_add')}
        </motion.button>
      )}
    </motion.div>
  )
}

function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}