/** 屏幕驱动：清屏落笔。行尾 \x1b[K 清除残影。 */
import { S } from './ansi.js'

export function paint(lines) {
  process.stdout.write(['\x1b[2J\x1b[H', ...lines.map(l => l + '\x1b[K'), ''].join('\n'))
}

export function paintBelow(lines) {
  process.stdout.write('\x1b[s' + [...lines, ''].join('\n') + '\x1b[u')
}
