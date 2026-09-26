import { test } from 'node:test'
import assert from 'node:assert/strict'
import YAML from 'yaml'
import { statusSnapshot, validateProjectPath } from './status.js'

test('状态快照：服务/模型/构建', () => {
  const snap = statusSnapshot({
    config: { service: { port: 3080 }, project: { path: 'C:\\p', lastBuildHead: 'abc123def' }, model: {} },
    owners: [{ pid: 1, name: 'node' }],
    settingsDoc: YAML.parseDocument('agent-default-model:\n  provider: glm\n  model: glm-4.6\n'),
  })
  assert.equal(snap.service, '运行中')
  assert.equal(snap.url, 'http://127.0.0.1:3080')
  assert.equal(snap.model, 'glm-4.6')
  assert.equal(snap.build, 'abc123d')
  assert.equal(snap.preset, '公网直连')
})

test('无 settings 文档时模型显示未配置', () => {
  const snap = statusSnapshot({ config: { service: { port: 3080 }, project: {}, model: {} }, owners: [], settingsDoc: undefined })
  assert.equal(snap.service, '已停止')
  assert.equal(snap.model, '未配置')
})

test('npm 全局模式：build 行显示 dsh 版本', () => {
  const snap = statusSnapshot({
    config: { service: { port: 3080 }, launch: { mode: 'npm' }, project: {}, model: {} },
    owners: [], settingsDoc: undefined, dshVersion: '0.1.5-rc.3',
  })
  assert.equal(snap.build, 'dsh 0.1.5-rc.3')
  assert.equal(snap.launch, 'npm 全局')
})

test('npm 全局模式：无版本信息时显示未知', () => {
  const snap = statusSnapshot({
    config: { service: { port: 3080 }, launch: { mode: 'npm' }, project: {}, model: {} },
    owners: [], settingsDoc: undefined, dshVersion: null,
  })
  assert.equal(snap.build, '未知版本')
})

test('项目路径校验：package.json 姓名或 apps/cli', () => {
  assert.equal(validateProjectPath('C:\\Project\\deepseek-harness').ok, true)
  assert.equal(validateProjectPath('C:\\Windows').ok, false)
  assert.equal(validateProjectPath('C:\\不存在').ok, false)
})
