import { Component } from 'react'

/**
 * React 错误边界：捕获子组件渲染错误，避免整个应用白屏。
 * 生产环境下显示友好提示与重试按钮，开发环境下保留控制台错误。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] 组件渲染错误:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
          <div className="rounded-2xl bg-surface p-6 shadow-card ring-1 ring-border max-w-md">
            <h2 className="mb-2 text-base font-semibold text-text-primary">页面加载出错</h2>
            <p className="mb-4 text-xs leading-relaxed text-text-secondary">
              当前页面发生渲染错误，请尝试返回或刷新。如果问题持续存在，请反馈给开发者。
            </p>
            {this.state.error?.message && (
              <p className="mb-4 rounded-lg bg-danger/10 p-2 text-[11px] text-danger">
                {this.state.error.message}
              </p>
            )}
            <div className="flex justify-center gap-2">
              {this.props.onBack && (
                <button
                  onClick={this.props.onBack}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
                >
                  返回
                </button>
              )}
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
              >
                重试
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
