import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { EASE } from '../lib/motion'

/**
 * 管理页统一外壳：玻璃顶栏 + 入场动效
 */
export default function PageHeader({ title, onBack, action }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-border px-6 py-4"
    >
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onBack}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface/60 text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
      >
        <ArrowLeft size={18} />
      </motion.button>
      <h1 className="flex-1 text-lg font-semibold tracking-tight text-text-primary">{title}</h1>
      {action}
    </motion.header>
  )
}
