import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nodeVersionOk, planGates, buildDshCommand, childEnv, makeLineFeeder } from './lifecycle.js'

test('Node 版本闸：22.19 界限', () => {
  assert.equal(nodeVersionOk('v22.19.0'), true)
  assert.equal(nodeVersionOk('v22.18.9'), false)
  assert.equal(nodeVersionOk('v23.5.0'), false)
  assert.equal(nodeVersionOk('v24.0.0'), true)
  assert.equal(nodeVersionOk('v26.1.0'), true)
  assert.equal(nodeVersionOk('坏数据'), false)
})

test('闸门判定', () => {
  assert.deepEqual(
    planGates({ nodeModulesExists: false, lockMtime: 0, pkgMtime: 0, lastInstallAt: 0, gitHead: 'a', lastBuildHead: 'a' }),
    { install: true, build: false },
  )
  assert.deepEqual(
    planGates({ nodeModulesExists: true, lockMtime: 200, pkgMtime: 100, lastInstallAt: 150, gitHead: 'b', lastBuildHead: 'a' }),
    { install: true, build: true },
  )
  assert.deepEqual(
    planGates({ nodeModulesExists: true, lockMtime: 100, pkgMtime: 100, lastInstallAt: 150, gitHead: 'a', lastBuildHead: null }),
    { install: false, build: true },
  )
})

test('dsh 命令组装：patch 先于应用级选项', () => {
  assert.deepEqual(buildDshCommand({}), ['pnpm', 'dsh', 'web'])
  assert.deepEqual(buildDshCommand({ port: 8080, autoOpenBrowser: false, patches: ['C:\\x y\\p.yml'] }),
    ['pnpm', 'dsh', 'web', '--patch', 'C:\\x y\\p.yml', '--port', '8080', '--no-open'])
})

test('dsh 命令组装：npm 全局模式直接走 dsh web', () => {
  assert.deepEqual(buildDshCommand({ mode: 'npm' }), ['dsh', 'web'])
  assert.deepEqual(buildDshCommand({ mode: 'npm', port: 9090, autoOpenBrowser: false, patches: ['p.yml'] }),
    ['dsh', 'web', '--patch', 'p.yml', '--port', '9090', '--no-open'])
})

test('子进程 env 必含 corepack 非交互', () => {
  const env = childEnv({ FOO: '1' })
  assert.equal(env.COREPACK_ENABLE_DOWNLOAD_PROMPT, '0')
  assert.equal(env.FOO, '1')
})

test('逐行喂入：跨 chunk 的半行正确拼接并去 CR', () => {
  const got = []
  const f = makeLineFeeder((l) => got.push(l))
  f.feed('dsh web: http://127.0.0.1:3080/?token=ab\r\nsecond')
  f.feed(' line\r\n')
  f.end()
  assert.deepEqual(got, ['dsh web: http://127.0.0.1:3080/?token=ab', 'second line'])
})
