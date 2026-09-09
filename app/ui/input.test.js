import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeKey, digitSelect } from './input.js'

test('方向键与功能键映射', () => {
  assert.deepEqual(decodeKey(Buffer.from([0x1b, 0x5b, 0x41])), { type: 'up' })
  assert.deepEqual(decodeKey(Buffer.from([0x1b, 0x5b, 0x42])), { type: 'down' })
  assert.deepEqual(decodeKey(Buffer.from([0x1b])), { type: 'esc' })
  assert.deepEqual(decodeKey(Buffer.from([0x0d])), { type: 'enter' })
  assert.deepEqual(decodeKey(Buffer.from([0x20])), { type: 'space' })
  assert.deepEqual(decodeKey(Buffer.from([0x7f])), { type: 'backspace' })
  assert.deepEqual(decodeKey(Buffer.from([0x03])), { type: 'ctrl-c' })
})

test('可打印字符按 utf8 解码', () => {
  assert.deepEqual(decodeKey(Buffer.from('启', 'utf8')), { type: 'char', ch: '启' })
})

test('digitSelect 数字键 → 0-based 下标', () => {
  assert.equal(digitSelect({ type: 'char', ch: '1' }, 5), 0)
  assert.equal(digitSelect({ type: 'char', ch: '3' }, 5), 2)
  assert.equal(digitSelect({ type: 'char', ch: '5' }, 5), 4)
  // 越界忽略
  assert.equal(digitSelect({ type: 'char', ch: '6' }, 5), -1)
  assert.equal(digitSelect({ type: 'char', ch: '0' }, 5), -1)
  // 长度≥10 时 0 落到第 10 项（下标 9）
  assert.equal(digitSelect({ type: 'char', ch: '0' }, 10), 9)
  // 非数字/其它按键类型忽略
  assert.equal(digitSelect({ type: 'char', ch: 'a' }, 5), -1)
  assert.equal(digitSelect({ type: 'up' }, 5), -1)
  assert.equal(digitSelect({ type: 'char', ch: '1' }, 0), -1)
})
