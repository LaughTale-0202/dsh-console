import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverModels, configureProvider, currentDefault, listProviders, setDeepSeekKey, removeProvider } from './model.js'

const dir = () => mkdtempSync(join(tmpdir(), 'dshmodel-'))

test('发现模型：OpenAI 兼容 /models', async () => {
  const fake = async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'glm-4.6' }, { id: 'glm-4.5' }, {}] }) })
  assert.deepEqual(await discoverModels('https://x.example/api/paas/v4/', 'k', fake), ['glm-4.6', 'glm-4.5'])
  const bad = async () => ({ ok: false, status: 401, json: async () => ({}) })
  await assert.rejects(() => discoverModels('https://x', 'k', bad), /401/)
})

test('三写入点：凭据 ref + 路由 + 默认模型；保注释', async () => {
  const home = dir()
  writeFileSync(join(home, 'settings.yaml'), '# 我的设置\nother-ns:\n  a: 1\n')
  await configureProvider({ dshHome: home, providerId: 'glm', baseUrl: 'https://open.example/v4', apiKeyRef: 'GLM_API_KEY', apiKey: 'sk-x', modelId: 'glm-4.6', modelName: 'GLM-4.6' })
  const cred = readFileSync(join(home, '.credentials.yaml'), 'utf8')
  assert.ok(cred.includes('version: 1') && cred.includes('GLM_API_KEY: sk-x'))
  const settings = readFileSync(join(home, 'settings.yaml'), 'utf8')
  assert.ok(settings.includes('# 我的设置'))
  assert.ok(settings.includes('other-ns:'))
  assert.ok(settings.includes('api: openai-completions'))
  assert.ok(settings.includes('baseURL: https://open.example/v4'))
  assert.ok(settings.includes('apiKeyEnv: GLM_API_KEY'))
  assert.ok(settings.includes('id: glm-4.6'))
  assert.deepEqual(currentDefault(home), { provider: 'glm', model: 'glm-4.6' })
  assert.deepEqual(listProviders(home), ['glm'])
})

test('路由名校验 / DeepSeek key / 清除', async () => {
  const home = dir()
  await assert.rejects(() => configureProvider({ dshHome: home, providerId: 'Bad_Id', baseUrl: 'u', apiKeyRef: 'R', apiKey: 'k', modelId: 'm' }), /路由名/)
  await setDeepSeekKey({ dshHome: home, apiKey: 'sk-ds' })
  assert.ok(readFileSync(join(home, '.credentials.yaml'), 'utf8').includes('DEEPSEEK_API_KEY: sk-ds'))
  await configureProvider({ dshHome: home, providerId: 'glm', baseUrl: 'u', apiKeyRef: 'R', apiKey: 'k', modelId: 'm' })
  await removeProvider({ dshHome: home, providerId: 'glm', resetDefault: true })
  assert.deepEqual(listProviders(home), [])
  assert.equal(currentDefault(home), null)
})

test('真实 ~/.dsh schema 兼容：records 保留且 refs 可追加', async () => {
  const home = dir()
  writeFileSync(join(home, '.credentials.yaml'), 'version: 1\nrecords:\n  client-connection/browser-session:\n    kind: grant\n    payload:\n      version: 1\n      secret: s\nrefs:\n  DEEPSEEK_API_KEY: old\n')
  writeFileSync(join(home, 'settings.yaml'), 'ui-onboarding:\n  welcomeNoticeVersion: 2026-08-13.1\nagent-default-model:\n  provider: deepseek-official\n  model: deepseek-v4-flash\n')
  await configureProvider({ dshHome: home, providerId: 'glm', baseUrl: 'https://open/v4', apiKeyRef: 'GLM_API_KEY', apiKey: 'k-new', modelId: 'glm-4.6' })
  const cred = readFileSync(join(home, '.credentials.yaml'), 'utf8')
  assert.ok(cred.includes('records:'))
  assert.ok(cred.includes('DEEPSEEK_API_KEY: old'))
  assert.ok(cred.includes('GLM_API_KEY: k-new'))
  const settings = readFileSync(join(home, 'settings.yaml'), 'utf8')
  assert.ok(settings.includes('ui-onboarding:'))
  assert.deepEqual(currentDefault(home), { provider: 'glm', model: 'glm-4.6' })
})
