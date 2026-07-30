import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon, Monitor, Folder, MapPin, Upload, FileJson, FileSpreadsheet, ChevronRight, FolderOpen, RotateCcw, KeyRound, RefreshCw, Copy, Check, Globe, Save, AlertTriangle, Sparkles } from 'lucide-react'
import { useI18n, LANGS } from '../lib/i18n'
import { getSettings, getApiToken, resetApiToken, setApiConfig } from '../lib/api'
import { cn } from '../lib/cn'
import { EASE } from '../lib/motion'
import PageHeader from './PageHeader'

const THEMES = [
  { code: 'light', icon: Sun, labelKey: 'settings_theme_light' },
  { code: 'dark', icon: Moon, labelKey: 'settings_theme_dark' },
  { code: 'system', icon: Monitor, labelKey: 'settings_theme_system' }
]

export default function SettingsView({
  theme,
  animations,
  onChangeTheme,
  onChangeAnimations,
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
  const [defaultDataDir, setDefaultDataDir] = useState('')
  const [apiInfo, setApiInfo] = useState(null)
  const [apiForm, setApiForm] = useState({ port: 3001, host: '127.0.0.1', lanMode: false, token: '' })
  const [copied, setCopied] = useState(false)
  const [apiSaved, setApiSaved] = useState(false)
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    getSettings().then((s) => {
      setDataDir(s.dataDir || '')
      setDefaultDataDir(s.defaultDataDir || '')
    })
    getApiToken().then((info) => {
      setApiInfo(info)
      setApiForm({
        port: info.port || 3001,
        host: info.host || '127.0.0.1',
        lanMode: info.lanMode || false,
        token: info.token || ''
      })
    })
  }, [])

  const handleCopyToken = async () => {
    if (!apiInfo?.token) return
    try {
      await navigator.clipboard.writeText(apiInfo.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      /* ignore */
    }
  }

  const handleRefreshToken = async () => {
    const next = await resetApiToken()
    setApiInfo(next)
    setApiForm((f) => ({ ...f, token: next.token }))
    setCopied(false)
    setApiSaved(false)
  }

  const handleSaveApiConfig = async () => {
    setApiError('')
    const port = Number(apiForm.port)
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
      setApiError(t('settings_agentApi_portPlaceholder'))
      return
    }
    if (!apiForm.token || apiForm.token.trim().length < 8) {
      setApiError(t('settings_agentApi_tokenTooShort'))
      return
    }
    const next = await setApiConfig({
      port,
      host: apiForm.lanMode ? '0.0.0.0' : '127.0.0.1',
      lanMode: apiForm.lanMode,
      token: apiForm.token.trim()
    })
    setApiInfo(next)
    setApiSaved(true)
    setTimeout(() => setApiSaved(false), 1500)
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <PageHeader title={t('settings_title')} onBack={onBack} />

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.05 }}
          className="space-y-4"
        >
          {/* 语言 */}
          <Section title={t('settings_language')}>
            <div className="flex flex-wrap gap-2">
              {LANGS.map((l) => (
                <SelectChip key={l.code} active={lang === l.code} onClick={() => onChangeLang(l.code)}>
                  {l.label}
                </SelectChip>
              ))}
            </div>
          </Section>

          {/* 主题 */}
          <Section title={t('settings_theme')}>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((th) => {
                const Icon = th.icon
                const active = theme === th.code
                return (
                  <motion.button
                    key={th.code}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onChangeTheme(th.code)}
                    className={cn(
                      'relative flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-smooth',
                      active
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="theme-active"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="absolute inset-0 rounded-xl bg-primary-soft"
                      />
                    )}
                    <Icon size={20} className="relative" />
                    <span className="relative">{t(th.labelKey)}</span>
                  </motion.button>
                )
              })}
            </div>
          </Section>

          {/* 动效开关 */}
          <Section title={t('settings_animation')} desc={t('settings_animation_desc')}>
            <div className="grid grid-cols-2 gap-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => onChangeAnimations(true)}
                className={cn(
                  'relative flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-smooth',
                  animations
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                )}
              >
                <Sparkles size={18} />
                {t('settings_animation_on')}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => onChangeAnimations(false)}
                className={cn(
                  'relative flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-smooth',
                  !animations
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                )}
              >
                <Monitor size={18} />
                {t('settings_animation_off')}
              </motion.button>
            </div>
          </Section>

          {/* 数据目录 */}
          <Section title={t('settings_dataDir')} desc={t('settings_dataDir_desc')}>
            <div className="mb-3 space-y-1.5 rounded-xl bg-bg px-3.5 py-2.5 text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <FolderOpen size={15} className="shrink-0 text-text-tertiary" />
                <span className="truncate font-medium">{dataDir ? dataDir : defaultDataDir}</span>
              </div>
              {!dataDir && defaultDataDir && (
                <p className="pl-[1.375rem] text-xs text-text-tertiary">{t('settings_dataDir_default')}</p>
              )}
            </div>
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onChangeDataDir}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                <Folder size={15} />
                {t('settings_btn_changeDir')}
              </motion.button>
              {dataDir && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onResetDataDir}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-tertiary transition-smooth hover:bg-surface-hover"
                >
                  <RotateCcw size={15} />
                  {t('settings_btn_resetDir')}
                </motion.button>
              )}
            </div>
          </Section>

          {/* Agent API */}
          <Section title={t('settings_agentApi')} desc={t('settings_agentApi_desc')}>
            <div className="space-y-3">
              {/* 端口 */}
              <div className="flex items-center gap-3 rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                <KeyRound size={15} className="shrink-0 text-text-tertiary" />
                <span className="w-20 shrink-0 text-text-tertiary">{t('settings_agentApi_port')}</span>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={apiForm.port}
                  onChange={(e) => setApiForm((f) => ({ ...f, port: e.target.value }))}
                  placeholder={t('settings_agentApi_portPlaceholder')}
                  className="input h-8 w-24 text-xs"
                />
              </div>

              {/* 局域网开关 */}
              <label className="flex cursor-pointer items-center justify-between rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-text-secondary">
                  <Globe size={15} className="text-text-tertiary" />
                  {t('settings_agentApi_lanMode')}
                </span>
                <input
                  type="checkbox"
                  checked={apiForm.lanMode}
                  onChange={(e) => setApiForm((f) => ({ ...f, lanMode: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
              </label>
              {apiForm.lanMode && (
                <p className="flex items-start gap-1.5 text-xs text-warn">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {t('settings_agentApi_lanMode_desc')}
                </p>
              )}

              {/* Token */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                  <KeyRound size={15} className="shrink-0 text-text-tertiary" />
                  <span className="w-20 shrink-0 text-text-tertiary">{t('settings_agentApi_token')}</span>
                  <input
                    type="text"
                    value={apiForm.token}
                    onChange={(e) => setApiForm((f) => ({ ...f, token: e.target.value }))}
                    placeholder={t('settings_agentApi_tokenPlaceholder')}
                    className="input h-8 flex-1 text-xs font-mono"
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCopyToken}
                    title={t('settings_agentApi_copy')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
                  >
                    {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRefreshToken}
                    title={t('settings_agentApi_refresh')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
                  >
                    <RefreshCw size={14} />
                  </motion.button>
                </div>
              </div>

              {apiError && <p className="text-xs text-danger">{apiError}</p>}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSaveApiConfig}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
              >
                {apiSaved ? <Check size={15} /> : <Save size={15} />}
                {apiSaved ? t('settings_agentApi_saved') : t('settings_agentApi_save')}
              </motion.button>
            </div>
          </Section>

          {/* 数据管理 */}
          <Section title={t('settings_dataManage')}>
            <div className="space-y-2">
              <ManageRow
                icon={<Folder size={18} />}
                title={t('settings_manageCategories')}
                desc={t('settings_manageCategories_desc')}
                onClick={onManageCategories}
              />
              <ManageRow
                icon={<MapPin size={18} />}
                title={t('settings_manageLocations')}
                desc={t('settings_manageLocations_desc')}
                onClick={onManageLocations}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <DataBtn icon={<Upload size={15} />} onClick={onImport}>{t('btn_import')} JSON</DataBtn>
              <DataBtn icon={<FileJson size={15} />} onClick={onExportJSON}>{t('export_json')}</DataBtn>
              <DataBtn icon={<FileSpreadsheet size={15} />} onClick={onExportCSV}>{t('export_csv')}</DataBtn>
            </div>
          </Section>
        </motion.div>
      </main>
    </div>
  )
}

function Section({ title, desc, children }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-1 text-sm font-semibold text-text-primary">{title}</h2>
      {desc && <p className="mb-3 text-xs leading-relaxed text-text-tertiary">{desc}</p>}
      {children}
    </section>
  )
}

function SelectChip({ active, onClick, children }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={cn(
        'rounded-xl border px-4 py-2 text-sm font-medium transition-smooth',
        active
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
      )}
    >
      {children}
    </motion.button>
  )
}

function ManageRow({ icon, title, desc, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-smooth hover:bg-surface-hover"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-text-secondary">{title}</span>
        <span className="block text-xs text-text-tertiary">{desc}</span>
      </span>
      <ChevronRight size={16} className="text-text-tertiary transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  )
}

function DataBtn({ icon, onClick, children }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
    >
      <span className="text-primary">{icon}</span>
      {children}
    </motion.button>
  )
}
