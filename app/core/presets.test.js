import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLaunchEnv, buildInstallEnv, upsertDotenv, exportRootCertsCommand } from './presets.js'

const base = { enabled: false, telemetryOff: true, nodeExtraCaCerts: null, proxy: { http: null, https: null, noProxy: null }, mirrors: { npmRegistry: null, corepackRegistry: null, nodeDistUrl: null } }

test('未启用不注入任何变量', () => { assert.deepEqual(buildLaunchEnv(base), {}) })

test('遥测与 CA 与代理', () => {
  const env = buildLaunchEnv({ ...base, enabled: true, nodeExtraCaCerts: 'C:\\ca.pem', proxy: { http: null, https: 'http://p:8080', noProxy: 'localhost' } })
  assert.equal(env.DSH_TELEMETRY_MODE, 'DISABLED')
  assert.equal(env.DSH_TELEMETRY_DISABLED, '1')
  assert.equal(env.NODE_EXTRA_CA_CERTS, 'C:\\ca.pem')
  assert.equal(env.HTTPS_PROXY, 'http://p:8080')
  assert.equal(env.HTTP_PROXY, 'http://p:8080')
  assert.equal(env.NO_PROXY, 'localhost')
})

test('镜像只进 install env', () => {
  const p = { ...base, enabled: true, mirrors: { ...base.mirrors, npmRegistry: 'https://m.npm/x', corepackRegistry: 'https://m.npm/y' } }
  assert.equal(buildLaunchEnv(p).NPM_CONFIG_REGISTRY, undefined)
  assert.equal(buildInstallEnv(p).NPM_CONFIG_REGISTRY, 'https://m.npm/x')
  assert.equal(buildInstallEnv(p).COREPACK_NPM_REGISTRY, 'https://m.npm/y')
})

test('dotenv 更新保留无关行', async () => {
  const f = join(mkdtempSync(join(tmpdir(), 'dshenv-')), '.env')
  writeFileSync(f, 'FOO=1\nHTTP_PROXY=old\n')
  await upsertDotenv(f, { HTTP_PROXY: 'new', NO_PROXY: 'x' })
  const text = readFileSync(f, 'utf8')
  assert.ok(text.includes('FOO=1'))
  assert.ok(text.includes('HTTP_PROXY=new'))
  assert.ok(text.includes('NO_PROXY=x'))
  assert.ok(!text.includes('old'))
})

test('根证书导出命令', () => {
  const cmd = exportRootCertsCommand('C:\\ca.pem')
  assert.ok(cmd.includes('LocalMachine\\Root') && cmd.includes('BEGIN CERTIFICATE') && cmd.includes('C:\\ca.pem'))
})
