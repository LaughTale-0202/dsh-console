import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePids, parseOwners, isNodeFamily } from './port.js'

test('解析 PS 输出的 PID 列表并去重', () => {
  assert.deepEqual(parsePids('1234\r\n1234\n5678\n'), [1234, 5678])
  assert.deepEqual(parsePids(''), [])
  assert.deepEqual(parsePids('abc\r\n  \n'), [])
})

test('解析单次探测输出：PID\\t名称', () => {
  assert.deepEqual(parseOwners('1234\tnode\r\n5678\tpnpm\n'), [
    { pid: 1234, name: 'node' },
    { pid: 5678, name: 'pnpm' },
  ])
  assert.deepEqual(parseOwners(''), [])
  assert.deepEqual(parseOwners('abc\n   \n'), [])
})

test('node 家族进程判定', () => {
  assert.equal(isNodeFamily('node'), true)
  assert.equal(isNodeFamily('pnpm'), true)
  assert.equal(isNodeFamily('node.exe'), true)
  assert.equal(isNodeFamily('chrome'), false)
})
