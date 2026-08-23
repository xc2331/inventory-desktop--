// 二维码图片组件：本地离线生成（见 lib/qr.js 说明），替代第三方在线服务
import { useQRDataUrl } from '../lib/qr'
import { cn } from '../lib/cn'

export default function QRImage({ url, width = 128, className }) {
  const src = useQRDataUrl(url, { width })
  if (!url || !src) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-lg bg-surface-hover text-[10px] text-text-tertiary', className)}
        style={{ width, height: width }}
      >
        …
      </div>
    )
  }
  return <img src={src} alt="QR" width={width} height={width} className={cn('rounded-lg ring-1 ring-border', className)} />
}
