import { useEffect, useRef } from 'react'

/**
 * Custom hook that wires mouse + touch drag events onto the canvas element
 * and forwards normalized canvas-space positions to the provided handlers.
 *
 * Usage:
 *   const { dragging } = useCanvasDrag(canvasRef, { onDown, onMove, onUp })
 *
 * `onDown`/`onMove` receive `{ x, y }` (pixels relative to canvas origin).
 * @param {React.RefObject<HTMLElement|null>} canvasRef
 * @param {Object} handlers
 * @param {(pos: {x:number, y:number}, e: Event) => void} handlers.onDown
 * @param {(pos: {x:number, y:number}, e: Event) => void} handlers.onMove
 * @param {(e: Event) => void} handlers.onUp
 * @returns {{ dragging: React.MutableRefObject<boolean> }}
 */
export function useCanvasDrag(canvasRef, handlers) {
  const dragging = useRef(false)

  useEffect(() => {
    const canvas = canvasRef?.current
    if (!canvas) return

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect()
      if (!rect || rect.width === 0) return { x: 0, y: 0 }
      const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX
      const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY
      return { x: clientX - rect.left, y: clientY - rect.top }
    }

    const onDown = (e) => {
      dragging.current = true
      if (typeof handlers.onDown === 'function') handlers.onDown(getPos(e), e)
    }
    const onMove = (e) => {
      if (!dragging.current) return
      if (typeof handlers.onMove === 'function') handlers.onMove(getPos(e), e)
    }
    const onUp = (e) => {
      if (!dragging.current) return
      dragging.current = false
      if (typeof handlers.onUp === 'function') handlers.onUp(e)
    }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp)
    canvas.addEventListener('mouseleave', onUp)
    canvas.addEventListener('touchstart', onDown)
    canvas.addEventListener('touchmove', onMove)
    canvas.addEventListener('touchend', onUp)
    canvas.addEventListener('touchcancel', onUp)
    canvas.style.touchAction = 'none'

    return () => {
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('mouseleave', onUp)
      canvas.removeEventListener('touchstart', onDown)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onUp)
      canvas.removeEventListener('touchcancel', onUp)
      canvas.style.touchAction = ''
    }
  }, [canvasRef, handlers])

  return { dragging }
}