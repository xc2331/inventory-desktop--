import { useI18n } from '../lib/i18n'

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  const { t } = useI18n()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
        <h3 className="mb-2 text-base font-semibold text-text-primary">{title}</h3>
        <p className="mb-5 text-sm text-text-tertiary">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
          >
            {t('btn_cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-danger"
          >
            {t('btn_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
