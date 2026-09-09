/** 各页共用的菜单选择器。 */
import { renderFooter, renderMenu, renderHeader } from '../ui/components.js'
import { startInput } from '../ui/input.js'
import { paint } from '../ui/screen.js'

export function choose(items, { title, esc = null } = {}) {
  let sel = 0
  return new Promise((resolve) => {
    const draw = () => paint([renderHeader(title), '', ...renderMenu({ items, selected: sel }), '', renderFooter('↑↓ 选择 · Enter 确认 · Esc 返回')])
    const stop = startInput((k) => {
      if (k.type === 'up') sel = (sel + items.length - 1) % items.length
      if (k.type === 'down') sel = (sel + 1) % items.length
      if (k.type === 'enter') { stop(); resolve(sel) }
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(esc) }
      draw()
    })
    draw()
  })
}

export function pause(hint) {
  return new Promise((resolve) => {
    const stop = startInput((k) => { if (k.type === 'enter' || k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve() } })
    process.stdout.write(`\r\n  ${hint}`)
  })
}
