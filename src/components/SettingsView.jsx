import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon, Monitor, Folder, MapPin, Upload, FileJson, FileSpreadsheet, ChevronRight, FolderOpen, RotateCcw, KeyRound, RefreshCw, Copy, Check } from 'lucide-react'
import { useI18n, LANGS } from '../lib/i18n'
import { getSettings, getApiToken, resetApiToken } from '../lib/api'
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
  onChangeTheme,
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
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setDataDir(s.dataDir || '')
      setDefaultDataDir(s.defaultDataDir || '')
    })
    getApiToken().then(setApiInfo)
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
    setCopied(false)
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <PageHeader title={t('settings_title')} onBack={onBack} />

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.05 }}
          className="space-y-5"
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
              <div className="flex items-center justify-between rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-text-tertiary">
                  <KeyRound size={15} />
                  {t('settings_agentApi_port')}
                </span>
                <span className="font-mono font-medium text-text-secondary">{apiInfo?.port || 3001}</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                <KeyRound size={15} className="shrink-0 text-text-tertiary" />
                <span className="truncate font-mono text-text-secondary">{apiInfo?.token || '…'}</span>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCopyToken}
                  title={t('settings_agentApi_copy')}
                  className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
                >
                  {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleRefreshToken}
                  title={t('settings_agentApi_refresh')}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
                >
                  <RefreshCw size={14} />
                </motion.button>
              </div>
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
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="mb-1 text-base font-semibold text-text-primary">{title}</h2>
      {desc && <p className="mb-3.5 text-xs leading-relaxed text-text-tertiary">{desc}</p>}
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
