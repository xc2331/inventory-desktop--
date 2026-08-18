import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { I18nProvider } from './lib/i18n.jsx'
import { getSettings } from './lib/api'
import './index.css'

const App = lazy(() => import('./App.jsx'))

const SuspenseFallback = (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
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
          <App />
        </Suspense>
      </I18nProvider>
    </React.StrictMode>
  )
}

document.addEventListener('DOMContentLoaded', () => { bootstrap() })