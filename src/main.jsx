import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { I18nProvider } from './lib/i18n.jsx'
import { getSettings } from './lib/api'
import './index.css'

async function bootstrap() {
  let lang = 'zh'
  try {
    const s = await getSettings()
    if (s && s.language) lang = s.language
  } catch (e) {
    /* 默认中文 */
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <I18nProvider initialLang={lang}>
        <App />
      </I18nProvider>
    </React.StrictMode>
  )
}

bootstrap()
