/** 各页共用的 UI 帮手：菜单选择与暂停。 */
import { renderFooter, renderMenu, renderHeader } from '../ui/components.js'
import { startInput } from '../ui/input.js'
import { paint } from '../ui/screen.js'

/** 简单菜单：返回所选下标或 esc(=null)。 */
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

/** 带信息区的列表选择：topLines 显示在菜单上方；items[i].label/.hint。返回下标或 esc。 */
export function listPick({ title, topLines = [], items }) {
  let sel = 0
  return new Promise((resolve) => {
    const draw = () => paint([renderHeader(title), '', ...topLines, ...renderMenu({ items, selected: sel }), '', renderFooter('↑↓ 选择 · Enter 确认 · Esc 返回')])
    const stop = startInput((k) => {
      if (k.type === 'up') sel = (sel + items.length - 1) % items.length
      if (k.type === 'down') sel = (sel + 1) % items.length
      if (k.type === 'enter') { stop(); resolve(sel) }
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(null) }
      draw()
    })
    draw()
  })
}

/** 回车/任意键继续。hint 已含样式。 */
export function pause(hint) {
  return new Promise((resolve) => {
    const stop = startInput((k) => { if (k.type === 'enter' || k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve() } })
    process.stdout.write(`\r\n  ${hint}`)
  })
}

/** 一次回车即返回的确认/继续。 */
export function confirmOnce({ title, lines, hint }) {
  paint([renderHeader(title), '', ...lines, '', renderFooter(hint)])
  return new Promise((resolve) => {
    const stop = startInput((k) => {
      if (k.type === 'enter' || k.type === 'space') { stop(); resolve(true) }
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(false) }
    })
  })
}

/** 等一次回车/任意键返回。 */
export function awaitEnter() {
  return new Promise((resolve) => {
    const stop = startInput((k) => { if (k.type === 'enter' || k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve() } })
  })
}
