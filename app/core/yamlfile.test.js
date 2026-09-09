import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yaml'
import { readDoc, patchYaml } from './yamlfile.js'

const dir = () => mkdtempSync(join(tmpdir(), 'dshyaml-'))

test('叶子级编辑保留既有注释与未触键', async () => {
  const d = dir()
  const f = join(d, '.credentials.yaml')
  const before = '# 我的凭据\nversion: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-old\n'
  const { writeFileSync } = await import('node:fs')
  writeFileSync(f, before)
  await patchYaml(f, (doc) => { doc.setIn(['refs', 'GLM_API_KEY'], 'sk-new') })
  const after = readFileSync(f, 'utf8')
  assert.ok(after.includes('# 我的凭据'))
  assert.ok(after.includes('DEEPSEEK_API_KEY: sk-old'))
  assert.ok(after.includes('GLM_API_KEY: sk-new'))
})

test('文件缺失时从空文档创建结构', async () => {
  const d = dir()
  const f = join(d, '.credentials.yaml')
  await patchYaml(f, (doc) => {
    if (doc.get('version') === undefined) doc.set('version', 1)
    if (doc.get('refs') === undefined) doc.set('refs', new YAML.YAMLMap())
    doc.setIn(['refs', 'GLM_API_KEY'], 'k')
  })
  const doc = readDoc(f)
  assert.equal(doc.getIn(['refs', 'GLM_API_KEY']), 'k')
  assert.equal(doc.get('version'), 1)
})

test('并发两次 patchYaml 串行共存', async () => {
  const d = dir()
  const f = join(d, 'settings.yaml')
  await Promise.all([
    patchYaml(f, (doc) => { doc.setIn(['llm-pi-ai', 'providers', 'glm', 'baseURL'], 'u1') }),
    patchYaml(f, (doc) => { doc.setIn(['llm-pi-ai', 'providers', 'k2', 'baseURL'], 'u2') }),
  ])
  const doc = readDoc(f)
  assert.equal(doc.getIn(['llm-pi-ai', 'providers', 'glm', 'baseURL']), 'u1')
  assert.equal(doc.getIn(['llm-pi-ai', 'providers', 'k2', 'baseURL']), 'u2')
})
