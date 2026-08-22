// UX-03 加载骨架屏：模拟 ItemCard 轮廓。
// 纯 CSS 动画（骨架呼吸 + shimmer 流光，见 index.css .skel-block），
// 替代原先 framer-motion 逐节点无限动画——JS 动画节点数随骨架块线性增长且不受
// 「关闭动画」设置控制；CSS 版可被 .no-anim 一键禁用，合成开销也更低。

export default function SkeletonCard({ index = 0 }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {/* 图片区域骨架 */}
      <div className="relative aspect-[4/3] w-full bg-bg">
        <div className="skel-block absolute inset-0" />
      </div>

      {/* 内容区骨架 */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="skel-block h-4 w-[60%]" />
          <div className="skel-block h-4 w-10" />
        </div>
        <div className="skel-block h-5 w-24 rounded-lg" />
        <div className="mt-1 flex items-center justify-between rounded-xl bg-bg p-1">
          <div className="flex items-center gap-1">
            <div className="skel-block h-7 w-7 rounded-md" />
            <div className="skel-block h-6 w-10" />
            <div className="skel-block h-7 w-7 rounded-md" />
          </div>
          <div className="skel-block h-4 w-14" />
        </div>
        <div className="flex gap-1.5">
          <div className="skel-block h-5 w-16 rounded-md" />
          <div className="skel-block h-5 w-20 rounded-md" />
        </div>
      </div>
    </div>
  )
}
