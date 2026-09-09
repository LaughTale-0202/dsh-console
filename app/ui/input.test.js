import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeKey } from './input.js'

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
