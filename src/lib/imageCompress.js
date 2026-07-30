// 前端图片压缩：将本地图片/拖入文件转为 Base64，优先 WebP，控制体积
const MAX_WIDTH = 800
const DEFAULT_QUALITY = 0.6
const MAX_SIZE_KB = 100
const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function canvasToBlob(canvas, type, quality) {
  if (canvas.toBlob) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  }
  // 旧版 Electron 兼容
  const dataUrl = canvas.toDataURL(type, quality)
  const res = await fetch(dataUrl)
  return res.blob()
}

/**
 * 压缩图片文件/路径/Blob 为 Base64 字符串
 * @param {File|Blob|string} source 图片源（本地路径、URL、File、Blob）
 * @returns {Promise<{ok:boolean, data?:string, error?:string, sizeKB:number}>}
 */
export async function compressImageToBase64(source) {
  let objectUrl = ''
  try {
    let src = source
    if (source instanceof File || source instanceof Blob) {
      objectUrl = URL.createObjectURL(source)
      src = objectUrl
    } else if (typeof source === 'string') {
      src = source.trim()
      if (!src) return { ok: false, error: 'empty source', sizeKB: 0 }
      // 如果已经是 Base64 或网络 URL，直接返回原值
      if (/^(data:|https?:|file:)/i.test(src)) {
        return { ok: true, data: src, sizeKB: estimateBase64SizeKB(src) }
      }
    }

    const img = await loadImage(src)
    if (objectUrl) URL.revokeObjectURL(objectUrl)

    const { canvas } = resizeCanvas(img)

    // 优先尝试 WebP
    let blob = await canvasToBlob(canvas, 'image/webp', DEFAULT_QUALITY)
    let type = 'image/webp'

    // WebP 不可用或体积过大时回退 JPEG
    let quality = DEFAULT_QUALITY
    let attempts = 0
    while ((!blob || blob.size > MAX_SIZE_BYTES) && attempts < 6) {
      if (!blob || blob.type === 'image/webp') {
        type = 'image/jpeg'
        blob = await canvasToBlob(canvas, type, quality)
      } else {
        quality = Math.max(0.2, quality - 0.1)
        blob = await canvasToBlob(canvas, type, quality)
      }
      attempts++
    }

    const base64 = await blobToBase64(blob)
    const sizeKB = Math.round((base64.length * 0.75) / 1024)

    if (sizeKB > MAX_SIZE_KB) {
      return {
        ok: false,
        error: `压缩后仍约 ${sizeKB}KB，超过 ${MAX_SIZE_KB}KB。请选择更小的图片或降低质量。`,
        sizeKB
      }
    }

    return { ok: true, data: base64, sizeKB }
  } catch (e) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    return { ok: false, error: e.message || '图片压缩失败', sizeKB: 0 }
  }
}

function resizeCanvas(img) {
  let w = img.naturalWidth || img.width
  let h = img.naturalHeight || img.height
  if (w > MAX_WIDTH) {
    h = Math.round((h * MAX_WIDTH) / w)
    w = MAX_WIDTH
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, w, h }
}

function estimateBase64SizeKB(base64) {
  try {
    const b64 = base64.split(',')[1] || base64
    return Math.round((b64.length * 0.75) / 1024)
  } catch {
    return 0
  }
}

/**
 * 将本地图片路径读取并压缩为 Base64
 */
export async function pathToBase64(path) {
  return compressImageToBase64(path)
}
