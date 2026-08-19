import { motion } from 'framer-motion'

// UX-03 加载骨架屏：模拟 ItemCard 轮廓 + shimmer 呼吸动画
// 替换 "Loading..." 文字，提供更直观的空状态反馈
export default function SkeletonCard({ index = 0 }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {/* 图片区域骨架 */}
      <div className="relative aspect-[4/3] w-full bg-bg">
        <SkeletonBlock className="absolute inset-0" />
      </div>

      {/* 内容区骨架 */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <SkeletonBlock className="h-4 w-[60%]" />
          <SkeletonBlock className="h-4 w-10" />
        </div>
        <SkeletonBlock className="h-5 w-24 rounded-lg" />
        <div className="mt-1 flex items-center justify-between rounded-xl bg-bg p-1">
          <div className="flex items-center gap-1">
            <SkeletonBlock className="h-7 w-7 rounded-md" />
            <SkeletonBlock className="h-6 w-10" />
            <SkeletonBlock className="h-7 w-7 rounded-md" />
          </div>
          <SkeletonBlock className="h-4 w-14" />
        </div>
        <div className="flex gap-1.5">
          <SkeletonBlock className="h-5 w-16 rounded-md" />
          <SkeletonBlock className="h-5 w-20 rounded-md" />
        </div>
      </div>
    </div>
  )
}

function SkeletonBlock({ className = '' }) {
  return (
    <motion.div
      className={`relative overflow-hidden rounded-md bg-bg ${className}`}
      initial={false}
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* 流光条 */}
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{ x: ['0%', '200%'] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
      />
    </motion.div>
  )
}