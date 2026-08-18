import React, { Suspense, lazy, useMemo } from 'react'
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

const SuspenseFallback = (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fbfaf8' }}>
    加载中...
  </div>
)

async function bootstrap() {
  let lang = 'zh'
  try {
    const s = await getSettings()
    if (s && s.language) lang = s.language
  } catch (e) { /* lang 默认 zh */ }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <I18nProvider initialLang={lang}>
        <Suspense fallback={SuspenseFallback}>
          <MotionConfigured>
            <App />
          </MotionConfigured>
        </Suspense>
      </I18nProvider>
    </React.StrictMode>
  )
}

document.addEventListener('DOMContentLoaded', () => { bootstrap() })