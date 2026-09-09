/** 无框 UI 组件：全部为返回字符串/字符串数组的纯函数。 */
import { S, padEnd, truncate } from './ansi.js'

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function renderHeader(title, right) {
  return `  ${S.accent}◆${S.reset} ${S.bold}${title}${S.reset}${right === undefined ? '' : padEnd('', 40) + S.dim + right + S.reset}`
}

export function renderRule(width = 72) {
  return S.dim + '─'.repeat(width) + S.reset
}

export function renderStatusRow(label, value, dot) {
  const dotStr = dot === 'ok' ? `${S.green}●${S.reset}` : dot === 'err' ? `${S.red}●${S.reset}` : dot === 'off' ? `${S.dim}○${S.reset}` : ' '
  return `  ${S.dim}${padEnd(label, 6)}${S.reset} ${dotStr} ${value}`
}

export function renderMenu({ items, selected }) {
  const count = items.length
  const digits = Math.max(1, String(count).length)
  return items.map((it, i) => {
    const on = i === selected
    const num = `${on ? S.accent : S.dim}${String(i + 1).padStart(digits)}.${S.reset}`
    const cursor = on ? `${S.accent}❯${S.reset}` : ' '
    const label = padEnd(truncate(it.label, 20), 20)
    const hint = it.hint === undefined ? '' : `${S.dim}${truncate(it.hint ?? '', 34)}${S.reset}`
    const tag = it.tag === undefined ? '' : `${S.dim}${truncate(it.tag, 12)}${S.reset}`
    const labelOn = on ? `${S.inverse}${label}${S.reset}` : label
    return `  ${cursor} ${num} ${labelOn} ${hint} ${tag}`
  })
}

export function renderFooter(hint) {
  return `  ${S.dim}${hint}${S.reset}`
}

export function renderProgress(frac, width = 24) {
  const clamped = Math.min(1, Math.max(0, frac))
  const filled = Math.round(clamped * width)
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}
