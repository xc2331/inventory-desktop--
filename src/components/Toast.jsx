import { useEffect } from 'react'

export default function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [toast, onDone])

  if (!toast) return null

  const styles = {
    success: 'bg-stone-800 text-white',
    error: 'bg-rose-600 text-white'
  }

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <div
        className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
          styles[toast.type] || styles.success
        }`}
      >
        <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
        <span>{toast.message}</span>
      </div>
    </div>
  )
}
