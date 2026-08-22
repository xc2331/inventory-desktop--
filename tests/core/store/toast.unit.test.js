// ===== core/store/toast.unit.test.js =====
// Unit tests for the toast Zustand store (P3-2 / P3-4)
import { describe, it, expect } from 'vitest'
import { useToastStore } from '../../../src/core/store/toast'

describe('core/store/toast', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts()
  })

  it('addToast appends a toast entry', () => {
    const id = useToastStore.getState().addToast('保存成功', 'success')
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('保存成功')
    expect(toasts[0].type).toBe('success')
    expect(id).toBe(toasts[0].id)
  })

  it('addToast with custom duration', () => {
    useToastStore.getState().addToast('自定义时长', 'info', { duration: 5000 })
    expect(useToastStore.getState().toasts[0].duration).toBe(5000)
  })

  it('removeToast removes by id', () => {
    const id1 = useToastStore.getState().addToast('A')
    const id2 = useToastStore.getState().addToast('B')
    useToastStore.getState().removeToast(id1)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0].id).toBe(id2)
  })

  it('clearToasts removes all', () => {
    useToastStore.getState().addToast('A')
    useToastStore.getState().addToast('B')
    useToastStore.getState().clearToasts()
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('toast ids are unique and incrementing', () => {
    const id1 = useToastStore.getState().addToast('A')
    const id2 = useToastStore.getState().addToast('B')
    expect(id2).toBeGreaterThan(id1)
  })
})