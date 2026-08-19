import React, { Suspense, lazy, useMemo, Component, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { I18nProvider } from './lib/i18n.jsx'
import { getSettings } from './lib/api'
import './index.css'

const App = lazy(() => import('./App.jsx'))

const MotionConfigured = ({ children }) => {
  const config = useMemo(() => ({
    transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1.0] }
  }), [])
  return <MotionConfig {...config}>{children}</MotionConfig>
}

class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, stack: null }
    // 暴露给全局 error / unhandledrejection 监听器
    window.__globalErrorState = (next) => {
      this.setState({ error: next.error, stack: next.stack })
    }
  }
  static getDerivedStateFromError(err) { return { error: err, stack: err.stack || '' } }
  componentDidCatch(err, info) {
    console.error('GlobalErrorBoundary caught:', err, info)
  }
  componentWillUnmount() {
    delete window.__globalErrorState
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', backgroundColor: '#fbfaf8',
          padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>
            应用发生渲染错误
          </h2>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
            请将以下错误信息复制到聊天记录
          </p>
          <div style={{
            maxWidth: '720px', width: '100%', borderRadius: '8px',
            border: '1px solid #fca5a5', backgroundColor: '#fef2f2',
            padding: '16px', textAlign: 'left', fontSize: '12px',
            fontFamily: 'monospace', color: '#991b1b', whiteSpace: 'pre-wrap',
            wordBreak: 'break-all', maxHeight: '400px', overflow: 'auto'
          }}>
            {this.state.error.toString()}{this.state.stack ? `\n\n${this.state.stack}` : ''}
          </div>
          <button
            onClick={() => { this.setState({ error: null, stack: null }); window.location.reload() }}
            style={{
              marginTop: '16px', padding: '10px 20px', borderRadius: '8px',
              backgroundColor: '#6366f1', color: 'white', border: 'none',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const SuspenseFallback = (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100vh', backgroundColor: '#fbfaf8',
    fontFamily: 'system-ui, -apple-system, sans-serif', gap: '12px'
  }}>
    <div style={{
      width: '40px', height: '40px', borderRadius: '8px',
      background: 'linear-gradient(120deg, #e0e0e0 30%, #f5f5f5 50%, #e0e0e0 70%)',
      backgroundSize: '200% 100%', animation: 'skeleton-pulse 1.6s ease-in-out infinite'
    }} />
    <div style={{ fontSize: '14px', color: '#999' }}>加载中...</div>
  </div>
)

// 全局未捕获异常 / Promise rejection 兜底 — 防止白屏
window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault()
  console.error('Unhandled Promise rejection:', e.reason)
  if (window.__globalErrorState) {
    window.__globalErrorState({ error: e.reason, stack: e.reason?.stack || '' })
  }
})
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error)
  if (window.__globalErrorState) {
    window.__globalErrorState({
      error: e.error || new Error(e.message),
      stack: (e.error?.stack || e.message || '')
    })
  }
})

async function bootstrap() {
  let lang = 'zh'
  try {
    const s = await getSettings()
    if (s && s.language) lang = s.language
  } catch (e) { /* lang 默认 zh */ }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <I18nProvider initialLang={lang}>
          <Suspense fallback={SuspenseFallback}>
            <MotionConfigured>
              <App />
            </MotionConfigured>
          </Suspense>
        </I18nProvider>
      </GlobalErrorBoundary>
    </React.StrictMode>
  )
}

document.addEventListener('DOMContentLoaded', () => { bootstrap() })