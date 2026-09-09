/** ANSI 样式与显示宽度；全部纯函数。 */
export const S = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', inverse: '\x1b[7m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
  accent: '\x1b[38;5;75m',
}
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/
const ZERO = /[\u0300-\u036F\u200B-\u200D\uFE00-\uFE0F]/
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g

export function stripAnsi(s) { return s.replace(ANSI_RE, '') }
export function charWidth(ch) {
  if (ZERO.test(ch)) return 0
  return WIDE.test(ch) ? 2 : 1
}
export function stringWidth(s) {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w
}
export function padEnd(s, cols) {
  const d = cols - stringWidth(s)
  return d > 0 ? s + ' '.repeat(d) : s
}
export function padStart(s, cols) {
  const d = cols - stringWidth(s)
  return d > 0 ? ' '.repeat(d) + s : s
}
export function truncate(s, cols) {
  let w = 0
  let out = ''
  for (const ch of s) {
    const cw = charWidth(ch)
    if (w + cw > cols - 1) return out + '…'
    w += cw
    out += ch
  }
  return out
}
