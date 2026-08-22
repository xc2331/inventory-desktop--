// SQL 查询单入口 — 所有数据库操作必须通过此模块
// 禁止在业务代码中直接调用 window.lingguang.api.db
// 由 Electron 后端的 better-sqlite3 执行

function getDbApi() {
  if (typeof window !== 'undefined' && window.lingguang) {
    if (window.lingguang.api && window.lingguang.api.db) {
      return window.lingguang.api.db
    }
    if (window.lingguang.db) {
      return window.lingguang.db
    }
  }
  throw new Error('[db] Database API not initialized (window.lingguang.api.db or window.lingguang.db)')
}

/**
 * 执行 SELECT 查询
 * @param {string} sql - SQL 语句
 * @param {Array|Object|undefined} binds - 参数绑定（位置参数数组或命名参数对象）
 * @returns {Promise<Array>}
 */
export async function query(sql, binds) {
  const db = getDbApi()
  return binds !== undefined ? db.query({ sql, binds }) : db.query({ sql })
}

/**
 * 执行 INSERT / UPDATE / DELETE
 * @param {string} sql - SQL 语句
 * @param {Array|Object|undefined} binds - 参数绑定
 * @returns {Promise<{changes?: number}>}
 */
export async function execute(sql, binds) {
  const db = getDbApi()
  return binds !== undefined ? db.execute({ sql, binds }) : db.execute({ sql })
}

export default { query, execute }