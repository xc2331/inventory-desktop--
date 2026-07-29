import { motion } from 'framer-motion'

// 统一的缓动曲线
export const EASE = [0.22, 1, 0.36, 1]
export const EASE_SPRING = [0.34, 1.56, 0.64, 1]

// 通用过渡
export const transition = {
  duration: 0.28,
  ease: EASE
}

export const springTransition = {
  type: 'spring',
  stiffness: 380,
  damping: 30,
  mass: 0.8
}

// 列表容器：子项交错出现
export const listContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.02 }
  }
}

// 列表项：上浮淡入
export const listItem = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.34, ease: EASE }
  }
}

// 模态框遮罩
export const overlay = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } }
}

// 模态框内容
export const modal = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_SPRING }
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 6,
    transition: { duration: 0.18, ease: EASE }
  }
}

// 抽屉/侧栏
export const sidebar = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE } }
}

// Toast
export const toast = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.32, ease: EASE_SPRING }
  },
  exit: {
    opacity: 0,
    y: 12,
    scale: 0.96,
    transition: { duration: 0.2, ease: EASE }
  }
}

// 卡片悬浮
export const cardHover = {
  y: -4,
  transition: { duration: 0.25, ease: EASE }
}

export { motion }
