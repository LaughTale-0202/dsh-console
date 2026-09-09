/** 与 dsh-settings-file 相同协议：wx 创建 <file>.lock，指数退避，2 秒上限。 */
import { closeSync, openSync, unlinkSync } from 'node:fs'

export function withFileLock(file, fn) {
  const lock = `${file}.lock`
  const deadline = Date.now() + 2000
  let delay = 50
  const attempt = () => {
    let fd
    try {
      fd = openSync(lock, 'wx')
    } catch {
      if (Date.now() + delay > deadline) return Promise.reject(new Error(`写锁获取超时：${lock}`))
      return new Promise((r) => setTimeout(r, delay)).then(() => { delay *= 2; return attempt() })
    }
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        closeSync(fd)
        try { unlinkSync(lock) } catch { /* 已被清理 */ }
      })
  }
  return attempt()
}
