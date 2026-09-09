import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseDump, classifyRow, describeRow, renderOverlay, enrichRows,
  upsertCacheEntry, dropCacheEntry, CORE_ROW_IDS, basePackageName,
} from './plugins.js'

const DUMP = `# == @deepseek-ai/dsh-base
- id: session
  name: '@deepseek-ai/dsh-session'
- id: llm
  name: '@deepseek-ai/dsh-llm'
- id: tools
  name: '@deepseek-ai/dsh-tools'
  config:
    mode: !!js process.env.DSH_TOOLS_MODE
# == @deepseek-ai/dsh-web-app
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
- id: ui-schedule
  name: '@deepseek-ai/dsh-client-ui-schedule'
  disabled: true
`

function fakeProject() {
  const root = mkdtempSync(join(tmpdir(), 'dshplug-'))
  const mk = (p) => { mkdirSync(join(root, p), { recursive: true }) }
  mk('packages/host/webserver')
  writeFileSync(join(root, 'packages/host/webserver/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-host-webserver', description: 'HTTP 宿主' }))
  return root
}

test('解析 dump：保留 id/name/disabled，容忍 !!js 与注释', () => {
  const rows = parseDump(DUMP)
  assert.equal(rows.length, 5)
  const ws = rows.find((r) => r.id === 'webserver')
  assert.equal(ws.name, '@deepseek-ai/dsh-host-webserver')
  assert.equal(rows.find((r) => r.id === 'ui-schedule').disabled, true)
  assert.equal(rows.find((r) => r.id === 'llm').disabled, undefined)
})

test('分类与描述', () => {
  const root = fakeProject()
  assert.equal(classifyRow({ id: 'webserver', name: '@deepseek-ai/dsh-host-webserver' }, root), 'system')
  assert.equal(classifyRow({ id: 'x', name: './my-plugin' }, root), 'custom')
  assert.equal(classifyRow({ id: 'session', name: '@deepseek-ai/dsh-session/sub' }, root), 'system')
  assert.equal(describeRow({ id: 'webserver', name: '@deepseek-ai/dsh-host-webserver' }, root), 'HTTP 宿主')
  assert.equal(describeRow({ id: 'x', name: './nope' }, root), null)
  assert.equal(basePackageName('@deepseek-ai/dsh-session/invariant'), '@deepseek-ai/dsh-session')
})

test('overlay 渲染与缓存操作', () => {
  const text = renderOverlay([{ id: 'tool-web', mode: 'off' }, { id: 'ui-schedule', mode: 'on' }])
  assert.ok(text.includes('- id: tool-web') && text.includes('disabled: true'))
  assert.ok(text.includes('- id: ui-schedule') && text.includes('disabled: false'))
  let cache = []
  cache = upsertCacheEntry(cache, { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', origin: 'system', at: '2026-09-09T00:00:00Z', mode: 'off' })
  cache = upsertCacheEntry(cache, { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', origin: 'system', at: '2026-09-09T01:00:00Z', mode: 'on' })
  assert.equal(cache.length, 1)
  assert.equal(cache[0].mode, 'on')
  cache = dropCacheEntry(cache, 'tool-web')
  assert.equal(cache.length, 0)
})

test('行显示状态三分：启用/官方默认关/我停用', () => {
  const root = fakeProject()
  const rows = [
    { id: 'a', name: 'x' },
    { id: 'b', name: 'y', disabled: true },
    { id: 'c', name: 'z', disabled: true },
  ]
  const cache = [{ id: 'c', name: 'z', origin: 'custom', note: null, at: 't', mode: 'off' }]
  const view = enrichRows(rows, cache, root)
  assert.equal(view[0].state, 'on')
  assert.equal(view[1].state, 'off-official')
  assert.equal(view[2].state, 'off-user')
  assert.equal(CORE_ROW_IDS.includes('llm'), true)
})
