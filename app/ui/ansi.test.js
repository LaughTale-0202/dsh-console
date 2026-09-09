import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stringWidth, padEnd, truncate, stripAnsi } from './ansi.js'

test('CJK 双宽计算', () => {
  assert.equal(stringWidth('启动服务'), 8)
  assert.equal(stringWidth('dsh 控制台'), 10)
  assert.equal(stringWidth('abc'), 3)
})

test('padEnd 按显示宽度补齐', () => {
  assert.equal(stripAnsi(padEnd('启动', 8)), '启动    ')
  assert.equal(stringWidth(stripAnsi(padEnd('dsh 控制台', 14))), 14)
})

test('truncate 超宽截断带省略号', () => {
  assert.equal(truncate('控制台工具', 6), '控制…')
  assert.equal(truncate('abc', 6), 'abc')
})
