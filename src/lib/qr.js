// 二维码本地离线生成（qrcode 库，无任何网络请求）
// 背景：此前用 api.qrserver.com 在线生成，会把含一次性 token 的上传地址
// （内网 IP + 端口 + token）完整发送给第三方服务 —— 隐私泄露，本模块将其替换。
import QRCode from 'qrcode'

const cache = new Map()

/**
 * 生成二维码 dataURL（带缓存，同一地址只生成一次）
 * @param {string} text 编码内容（如上传 URL）
 * @param {{width?: number}} opts
 * @returns {Promise<string>} data:image/png;base64,...
 */
export async function makeQR(text, { width = 128 } = {}) {
  if (!text) return ''
  const key = `${width}::${text}`
  if (cache.has(key)) return cache.get(key)
  try {
    const url = await QRCode.toDataURL(text, {
      margin: 1,
      width,
      errorCorrectionLevel: 'M',
      color: { dark: '#1c1917', light: '#ffffff' }
    })
    if (cache.size > 32) cache.clear() // 简单防膨胀
    cache.set(key, url)
    return url
  } catch (e) {
    console.warn('[qr] 生成失败:', e?.message)
    return ''
  }
}

/** React 用的 hook 形态：url 变化时异步生成并返回 dataURL */
import { useState, useEffect } from 'react'
export function useQRDataUrl(url, opts) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    if (!url) { setSrc(''); return }
    makeQR(url, opts).then((d) => { if (alive) setSrc(d) })
    return () => { alive = false }
  }, [url])
  return src
}
