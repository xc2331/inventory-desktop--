// 诊断脚本：找出 QR 上传图片不显示的具体原因
// 使用方法：
//   1. 启动 Family Inventory
//   2. 打开开发者工具（F12 或 Ctrl+Shift+I）
//   3. 在 Console 标签页粘贴并运行下面的代码
//
// 也可以作为 preload 脚本注入：将本文件内容放到 Console 中执行

console.clear()
console.log('=== QR 图片诊断开始 ===\n')

// ---- 步骤 1: 检查 window.lingguang 是否存在 ----
if (!window.lingguang) {
  console.error('[诊断] window.lingguang 不存在！请确认是在 Electron 环境中运行')
  console.log('=== 诊断结束 ===')
} else {
  console.log('[步骤1] window.lingguang 存在 ✓')

  // ---- 步骤 2: 列出所有包含照片的物品 ----
  console.log('\n[步骤2] 查询所有有照片的物品...')
  window.lingguang.db.query({
    sql: 'SELECT id, name, photo FROM items WHERE photo IS NOT NULL AND photo != ""',
    binds: []
  }).then(rows => {
    console.log(`  共找到 ${rows.length} 个有照片的物品`)
    if (rows.length === 0) {
      console.log('  → 数据库中没有照片数据，请先扫码上传一张测试')
      console.log('=== 诊断结束 ===')
      return
    }

    rows.forEach(item => {
      const photoLen = item.photo.length
      const preview = item.photo.length > 80
        ? item.photo.substring(0, 80) + '...'
        : item.photo
      console.log(`  物品: ${item.name} (id=${item.id})`)
      console.log(`    photo 长度: ${photoLen} 字符`)
      console.log(`    photo 预览: "${preview}"`)

      // 判断 photo 字段类型
      if (/^data:/.test(item.photo)) {
        console.log(`    → 类型: data URL (base64 内嵌)`)
      } else if (item.photo.match(/^photos\//i)) {
        console.log(`    → 类型: 相对路径 (photos/xxx)`)
      } else {
        console.log(`    → 类型: 未知格式（可能是裸 base64 或缺失前缀）`)
      }
    })
  }).catch(e => console.error('  查询失败:', e))

  // ---- 步骤 3: 测试 photo.url() 对每个物品 ----
  console.log('\n[步骤3] 测试 photo.url() 和 readPhoto...')
  window.lingguang.db.query({
    sql: 'SELECT id, name, photo FROM items WHERE photo IS NOT NULL AND photo != ""',
    binds: []
  }).then(rows => {
    rows.forEach(async (item) => {
      console.log(`\n  --- 物品: ${item.name} ---`)

      // 3a: 测试 photo.url()
      const url = window.lingguang.photo.url(item.photo)
      console.log(`  photo.url("${item.photo.substring(0, 60)}...") = "${url ? url.substring(0, 80) + '...' : ''}"`)

      if (url && url.startsWith('file://')) {
        console.log('  → file:// URL 返回，图片应正常显示 ✓')
      } else if (url && !url.startsWith('file://')) {
        console.log('  → 返回相对路径（文件可能不存在），将触发 readPhoto 兜底')
      } else {
        console.warn('  → 返回空字符串！这是 v1.5.7 的 bug，v1.5.8 已修复')
      }

      // 3b: 对相对路径测试 readPhoto
      if (!url || !url.startsWith('file://')) {
        try {
          const result = await window.lingguang.photo.read(item.photo)
          if (result.ok) {
            console.log(`  → readPhoto 成功，数据长度: ${result.data.length} 字符`)
            console.log(`  → readPhoto 前缀: "${result.data.substring(0, 50)}"`)
          } else {
            console.error(`  → readPhoto 失败: ${result.error}`)
          }
        } catch (e) {
          console.error(`  → readPhoto 异常: ${e.message}`)
        }
      }
    })
  })

  // ---- 步骤 4: 检查 dataDir ----
  console.log('\n[步骤4] 检查 dataDir 设置...')
  window.lingguang.settings.get().then(settings => {
    const dataDir = settings.dataDir || '(未设置，使用默认 userData)'
    console.log(`  dataDir: ${dataDir}`)
    if (dataDir === '(未设置，使用默认 userData)') {
      console.log('  → 使用默认 userData 目录（正常）')
    } else {
      console.log(`  → 用户自定义 dataDir，请确认该路径存在且可访问`)
    }
  })

  console.log('\n=== 诊断完成 ===')
  console.log('请检查以上输出，重点关注:')
  console.log('  1. photo.url() 是否返回空字符串')
  console.log('  2. readPhoto 是否成功')
  console.log('  3. photo 字段是否以 "data:" 或 "photos/" 开头')
}