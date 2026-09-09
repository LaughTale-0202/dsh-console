import { test } from 'node:test'
import assert from 'node:assert/strict'
import { S, stringWidth, stripAnsi } from './ansi.js'
import { renderMenu, renderHeader, renderProgress } from './components.js'

test('菜单光标只在选中行', () => {
  const rows = renderMenu({ items: [{ label: '启动服务', hint: '一键启动' }, { label: '停止服务' }], selected: 0 })
  assert.ok(rows[0].includes('❯'))
  assert.ok(!stripAnsi(rows[1]).includes('❯'))
})

test('菜单每行带编号且编号递增', () => {
  const rows = renderMenu({ items: [{ label: '启动服务' }, { label: '停止服务' }, { label: '返回' }], selected: 1 })
  const nums = rows.map(r => stripAnsi(r).match(/^\s+.\s+(\d+)\./)?.[1])
  assert.deepEqual(nums, ['1', '2', '3'])
})

test('菜单标签列按显示宽度对齐（含编号列，各行等宽）', () => {
  const items = [{ label: '启动服务' }, { label: 'stop' }]
  const rows = renderMenu({ items, selected: 0 })
  const widths = rows.map(r => stringWidth(stripAnsi(r)))
  const digits = String(items.length).length
  assert.equal(widths[0], widths[1])
  // 前导2 + 光标1 + 空格1 + 编号(digits+1) + 空格1 + 标签20 + hint/标签后两空格
  assert.equal(widths[1], 2 + 1 + 1 + (digits + 1) + 1 + 20 + 2)
})

test('进度条渲染', () => {
  assert.equal(renderProgress(0.5, 4), '▓▓░░')
  assert.equal(renderProgress(1, 3), '▓▓▓')
})

test('品牌行含标题与右侧文本', () => {
  const h = renderHeader('dsh 控制台', 'v0.1.0')
  assert.ok(h.includes('◆') && stripAnsi(h).includes('v0.1.0'))
})
