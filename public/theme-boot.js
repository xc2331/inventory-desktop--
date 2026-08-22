// 主题预启动脚本：在首帧渲染前根据 localStorage 镜像（useSettings 维护）
// 或系统偏好同步设置 dark 类，消除暗色用户启动时的白闪。
// 必须以经典 <script>（非 module）在 <head> 中同步执行。
;(function () {
  try {
    var theme = localStorage.getItem('theme') || 'system'
    var dark = theme === 'dark' ||
      (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    var el = document.documentElement
    if (dark) el.classList.add('dark')
    else el.classList.remove('dark')
  } catch (e) { /* ignore：首帧退化为主题默认亮色，由 React 启动后接管 */ }
})()
