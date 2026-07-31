import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon, Monitor, Folder, MapPin, Upload, FileJson, FileSpreadsheet, ChevronRight, FolderOpen, RotateCcw, KeyRound, RefreshCw, Copy, Check, Globe, Save, AlertTriangle, Sparkles, Minimize2, X, Download, Rocket, Loader2, ScrollText, Cpu, Smartphone, ChevronDown, ChevronUp, Zap } from 'lucide-react'
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
  closeAction,
  onChangeTheme,
  onChangeAnimations,
  onChangeCloseAction,
  onBack,
  onChangeLang,
  onChangeDataDir,
  onResetDataDir,
  onManageCategories,
  onManageLocations,
  onExportJSON,
  onExportCSV,
  onImport,
  updaterInfo,
  isCheckingUpdate,
  onChangeUpdateSource,
  onChangeAutoCheckUpdate,
  onCheckUpdate
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

          {/* 关闭行为 */}
          <Section title={t('settings_closeAction')} desc={t('settings_closeAction_desc')}>
            <div className="grid grid-cols-2 gap-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => onChangeCloseAction('minimize')}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-smooth',
                  closeAction === 'minimize'
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                )}
              >
                <Minimize2 size={18} />
                {t('settings_closeAction_minimize')}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => onChangeCloseAction('quit')}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-smooth',
                  closeAction === 'quit'
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                )}
              >
                <X size={18} />
                {t('settings_closeAction_quit')}
              </motion.button>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-text-tertiary/80">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {t('closeAction_note')}
            </p>
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

          {/* 软件更新 */}
          <Section title={t('settings_update')} desc={t('settings_update_desc')}>
            <div className="space-y-3">
              {/* 当前版本 + 检查按钮 */}
              <div className="flex items-center justify-between rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Rocket size={15} className="shrink-0 text-text-tertiary" />
                  <span>{t('settings_update_current')}</span>
                  <span className="font-mono font-medium text-text-primary">{updaterInfo?.currentVersion || '—'}</span>
                </div>
                <motion.button
                  whileTap={{ scale: isCheckingUpdate ? 1 : 0.97 }}
                  onClick={onCheckUpdate}
                  disabled={isCheckingUpdate}
                  className={cn(
                    'flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-smooth',
                    isCheckingUpdate
                      ? 'cursor-not-allowed bg-surface text-text-tertiary'
                      : 'bg-surface text-text-secondary hover:bg-surface-hover'
                  )}
                >
                  {isCheckingUpdate ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>检查中…</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      {t('update_btn_check')}
                    </>
                  )}
                </motion.button>
              </div>

              {/* 更新源 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">{t('settings_update_source')}</label>
                <select
                  value={updaterInfo?.source || ''}
                  onChange={(e) => onChangeUpdateSource(e.target.value)}
                  className="input h-9 w-full text-sm"
                >
                  {(updaterInfo?.sources || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-tertiary">
                  首选源失败后，会自动尝试其他源。
                </p>
              </div>

              {/* 自动检查开关 */}
              <label className="flex cursor-pointer items-center justify-between rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-text-secondary">
                  <RefreshCw size={15} className="text-text-tertiary" />
                  {t('settings_update_autoCheck')}
                </span>
                <input
                  type="checkbox"
                  checked={updaterInfo?.autoCheck !== false}
                  onChange={(e) => onChangeAutoCheckUpdate(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            </div>
          </Section>

          {/* 更新日志 / 新功能 */}
          <Section title={t('settings_whatsNew')} desc={t('settings_whatsNew_desc')}>
            <ReleaseNotes />
          </Section>

          {/* AI 能力说明 */}
          <Section title={t('settings_aiCapabilities')} desc={t('settings_aiCapabilities_desc')}>
            <div className="space-y-2">
              <CapabilityRow icon={<Zap size={16} />} title={t('ai_segment')} status="coming" />
              <CapabilityRow icon={<Cpu size={16} />} title={t('ai_recognize')} status="coming" />
              <CapabilityRow icon={<ScrollText size={16} />} title={t('ai_receipt')} status="coming" />
              <CapabilityRow icon={<Smartphone size={16} />} title={t('ai_scan')} status="coming" />
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-text-tertiary/80">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {t('ai_coming')}
            </p>
          </Section>

          {/* 手机扫码传图说明 */}
          <Section title={t('settings_qrUploadGuide')} desc={t('settings_qrUploadGuide_desc')}>
            <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed text-text-secondary">
              <li>进入「电子材料库」或物品表单的图片字段，点击「手机扫码传图」。</li>
              <li>确保手机与电脑连接同一 Wi-Fi。</li>
              <li>用微信/浏览器扫描二维码，手机上会打开临时上传页。</li>
              <li>拍照或从相册选择照片，上传成功后图片会自动填入当前表单。</li>
              <li>二维码一次性有效，上传成功后自动失效；可点击刷新重新生成。</li>
            </ol>
            <p className="mt-3 text-xs text-text-tertiary">提示：若扫描后打不开，请检查电脑防火墙是否放行应用，或尝试切换网络。</p>
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

const RELEASE_NOTES = [
  {
    version: 'v1.2.2',
    date: '2026-07-31',
    items: [
      '修复物品表单二维码服务启动后立即被关闭的问题，手机扫码上传现在可正常加载',
      '修复生成二维码后点击「关闭服务」无效的问题',
      '修复点击取消退出表单后可能出现的白屏问题',
      '物品表单支持 Ctrl+V 粘贴剪贴板图片',
      '电子材料库图片支持双击/点击大图查看',
      '修复位置地图右侧抽屉物品缩略图显示异常'
    ]
  },
  {
    version: 'v1.2.1',
    date: '2026-07-31',
    items: [
      '修复 frameless 窗口拖拽导致电子材料库/位置地图按钮无法点击的问题',
      '修复 Agent 接口新增位置不同步',
      '优化二维码局域网 IP 选择，提升同 Wi-Fi 下手机扫描成功率',
      '电子材料库支持资源链接、批量编辑、双击打开、右键编辑',
      '位置地图新增物品数量角标、空状态引导与使用提示',
      '设置新增「更新日志/新功能」与「AI 能力说明」面板',
      '新增「手机扫码传图」使用说明'
    ]
  },
  {
    version: 'v1.2.0',
    date: '2026-07-28',
    items: [
      '新增电子材料库：集中管理证件照、网址、教程、菜谱等',
      '新增位置地图可视化：按房间/位置查看物品分布',
      '新增手机扫码传图：手机拍照或选图上传到电脑',
      '新增外部 Agent API：AI 可通过 HTTP 接口查询或添加物品',
      '新增软件内更新检查与自动下载'
    ]
  }
]

function ReleaseNotes() {
  const [openIndex, setOpenIndex] = useState(0)
  return (
    <div className="space-y-2">
      {RELEASE_NOTES.map((note, idx) => {
        const open = openIndex === idx
        return (
          <div key={note.version} className="rounded-xl border border-border bg-bg overflow-hidden">
            <button
              onClick={() => setOpenIndex(open ? -1 : idx)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-xs text-primary">{note.version}</span>
                <span className="text-xs text-text-tertiary">{note.date}</span>
              </span>
              {open ? <ChevronUp size={14} className="text-text-tertiary" /> : <ChevronDown size={14} className="text-text-tertiary" />}
            </button>
            {open && (
              <ul className="space-y-1.5 px-3.5 pb-3 text-xs leading-relaxed text-text-secondary">
                {note.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CapabilityRow({ icon, title, status }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-bg px-3.5 py-2.5 text-sm">
      <span className="flex items-center gap-2 text-text-secondary">
        <span className="text-primary">{icon}</span>
        {title}
      </span>
      <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-text-tertiary">
        {status === 'coming' ? '后续接入' : '已启用'}
      </span>
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
