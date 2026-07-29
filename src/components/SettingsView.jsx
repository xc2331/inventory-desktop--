import { useState, useEffect } from 'react'
import { useI18n, LANGS } from '../lib/i18n'
import { getSettings } from '../lib/api'

export default function SettingsView({
  onBack,
  onChangeLang,
  onChangeDataDir,
  onResetDataDir,
  onManageCategories,
  onManageLocations,
  onExportJSON,
  onExportCSV,
  onImport
}) {
  const { t, lang } = useI18n()
  const [dataDir, setDataDir] = useState('')

  useEffect(() => {
    getSettings().then((s) => setDataDir(s.dataDir || ''))
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col bg-stone-100">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-6 py-4">
        <button onClick={onBack} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100">
          ←
        </button>
        <h1 className="text-lg font-semibold text-stone-800">{t('settings_title')}</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
        {/* 语言 */}
        <Section title={t('settings_language')}>
          <div className="flex gap-2">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => onChangeLang(l.code)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  lang === l.code
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Section>

        {/* 数据目录 */}
        <Section title={t('settings_dataDir')} desc={t('settings_dataDir_desc')}>
          <div className="mb-3 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
            {dataDir ? dataDir : t('settings_dataDir_default')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onChangeDataDir}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
            >
              {t('settings_btn_changeDir')}
            </button>
            {dataDir && (
              <button
                onClick={onResetDataDir}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-500 transition hover:bg-stone-50"
              >
                {t('settings_btn_resetDir')}
              </button>
            )}
          </div>
        </Section>

        {/* 数据管理 */}
        <Section title={t('settings_dataManage')}>
          <div className="space-y-2">
            <ManageRow
              icon="🏷️"
              title={t('settings_manageCategories')}
              desc={t('settings_manageCategories_desc')}
              onClick={onManageCategories}
            />
            <ManageRow
              icon="📍"
              title={t('settings_manageLocations')}
              desc={t('settings_manageLocations_desc')}
              onClick={onManageLocations}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onImport}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
            >
              {t('btn_import')} JSON
            </button>
            <button
              onClick={onExportJSON}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
            >
              {t('export_json')}
            </button>
            <button
              onClick={onExportCSV}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
            >
              {t('export_csv')}
            </button>
          </div>
        </Section>
      </main>
    </div>
  )
}

function Section({ title, desc, children }) {
  return (
    <section className="mb-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-stone-800">{title}</h2>
      {desc && <p className="mb-3 text-xs text-stone-400">{desc}</p>}
      {children}
    </section>
  )
}

function ManageRow({ icon, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 text-left transition hover:bg-stone-50"
    >
      <span className="text-xl">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-stone-700">{title}</span>
        <span className="block text-xs text-stone-400">{desc}</span>
      </span>
      <span className="text-stone-400">›</span>
    </button>
  )
}
