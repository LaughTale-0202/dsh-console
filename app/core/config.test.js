import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from './config.js'

const dir = () => mkdtempSync(join(tmpdir(), 'dshcfg-'))

test('缺失返回 null；保存后读回并补默认键', () => {
  const d = dir()
  const f = join(d, 'config.json')
  assert.equal(loadConfig(f), null)
  saveConfig(f, { ...DEFAULT_CONFIG, project: { ...DEFAULT_CONFIG.project, path: 'C:\\x' } })
  const cfg = loadConfig(f)
  assert.equal(cfg.project.path, 'C:\\x')
  assert.equal(cfg.presets.intranet.enabled, false)
  assert.equal(cfg.service.port, 3080)
})

test('未知版本拒绝加载', () => {
  const d = dir()
  const f = join(d, 'config.json')
  writeFileSync(f, JSON.stringify({ version: 99 }))
  assert.throws(() => loadConfig(f), /版本/)
})
