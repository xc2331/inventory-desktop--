import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, HelpCircle, Lightbulb, ChevronDown, MessageCircleQuestion } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE } from '../lib/motion'
import PageHeader from './PageHeader'

export default function HelpView({ onBack }) {
  const { t } = useI18n()
  const [openIdx, setOpenIdx] = useState(null)

  const faqs = [
    { q: t('help_faq_q1'), a: t('help_faq_a1') },
    { q: t('help_faq_q2'), a: t('help_faq_a2') },
    { q: t('help_faq_q3'), a: t('help_faq_a3') },
    { q: t('help_faq_q4'), a: t('help_faq_a4') },
    { q: t('help_faq_q5'), a: t('help_faq_a5') }
  ]

  const tips = [t('help_tip_1'), t('help_tip_2'), t('help_tip_3'), t('help_tip_4')]

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <PageHeader title={t('nav_help')} onBack={onBack} />

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.05 }}
          className="space-y-4"
        >
          {/* 新手指南 */}
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <BookOpen size={18} />
              </span>
              <h2 className="text-sm font-semibold text-text-primary">{t('help_gettingStarted')}</h2>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-text-secondary">
              <li>{t('help_gs_1')}</li>
              <li>{t('help_gs_2')}</li>
              <li>{t('help_gs_3')}</li>
              <li>{t('help_gs_4')}</li>
              <li>{t('help_gs_5')}</li>
            </ol>
          </section>

          {/* 使用技巧 */}
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                <Lightbulb size={18} />
              </span>
              <h2 className="text-sm font-semibold text-text-primary">{t('help_tips')}</h2>
            </div>
            <ul className="space-y-2">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {tip}
                </li>
              ))}
            </ul>
          </section>

          {/* 常见问题 */}
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <MessageCircleQuestion size={18} />
              </span>
              <h2 className="text-sm font-semibold text-text-primary">{t('help_faq')}</h2>
            </div>
            <div className="space-y-2">
              {faqs.map((f, i) => (
                <FaqItem
                  key={i}
                  open={openIdx === i}
                  onToggle={() => setOpenIdx(openIdx === i ? null : i)}
                  question={f.q}
                  answer={f.a}
                />
              ))}
            </div>
          </section>
        </motion.div>

        <div className="py-6 text-center text-xs text-text-tertiary/70">
          {t('help_footer')}
        </div>
      </main>
    </div>
  )
}

function FaqItem({ open, onToggle, question, answer }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
      >
        <span className="flex items-center gap-2">
          <HelpCircle size={14} className="shrink-0 text-primary" />
          {question}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: EASE }}>
          <ChevronDown size={15} className="shrink-0 text-text-tertiary" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="px-3.5 pb-3.5 pt-0 text-sm leading-relaxed text-text-tertiary">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
