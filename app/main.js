#!/usr/bin/env node
/** dsh 控制台主程序：装配 UI、config 与生命周期（状态首页 / 启动重启 / 插件 / 模型 / 预设 / 更新）。 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { S } from './ui/ansi.js'
import { startInput, textInput } from './ui/input.js'
import { renderFooter, renderHeader, renderMenu, renderRule, renderStatusRow, SPINNER } from './ui/components.js'
import { paint } from './ui/screen.js'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from './core/config.js'
import { findPortOwners, killTree } from './core/port.js'
import { startService } from './core/lifecycle.js'
import { IN_FLIGHT, LOGS_DIR, TOOL_ROOT, clearInFlight, runInstallBuild } from './core/pipeline.js'
import { buildLaunchEnv, buildInstallEnv } from './core/presets.js'
import { readSettingsDoc, statusSnapshot, validateProjectPath } from './pages/status.js'
import { pluginsPage } from './pages/plugins.js'
import { modelPage } from './pages/model.js'
import { presetsPage } from './pages/presets.js'
import { updatePage } from './pages/update.js'
import { wizardPage } from './pages/wizard.js'
import { createDesktopShortcut } from './core/shortcut.js'
import { openPath } from './core/native.js'

const CONFIG_FILE = join(TOOL_ROOT, 'config.json')
const DSH_HOME = join(homedir(), '.dsh')
const OVERLAY_FILE = join(TOOL_ROOT, 'data', 'plugins.cordis.yml')

function ensurePathForChildren() {
  const nodeDir = dirname(process.execPath)
  process.env.PATH = `${nodeDir}${process.env.PATH ? ';' + process.env.PATH : ''}`
}

let CONFIG = null

function ctx() {
  return {
    toolRoot: TOOL_ROOT,
    config: CONFIG,
    configFile: CONFIG_FILE,
    dshHome: DSH_HOME,
    overlayFile: OVERLAY_FILE,
    save() { saveConfig(CONFIG_FILE, CONFIG) },
  }
}

// —— 通用确认 ——
function askYesNo(lines, hint) {
  paint([renderHeader('dsh 控制台'), '', ...lines, '', renderFooter(hint)])
  return new Promise((resolve) => {
    const stop = startInput((k) => { if (k.type === 'enter') { stop(); resolve(true) } if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(false) } })
  })
}

function busyLoop(label) {
  let frame = 0
  const tail = []
  const timer = setInterval(() => {
    paint([renderHeader('dsh 控制台 · 请稍候'), '', `  ${S.accent}${SPINNER[frame++ % SPINNER.length]}${S.reset} ${label}`, renderRule(),
      ...tail.slice(-12).map((l) => `  ${S.dim}${l.slice(0, 100)}${S.reset}`), ''])
  }, 150)
  return { push: (l) => tail.push(l), stop: () => clearInterval(timer) }
}

function overlayPatches() {
  return existsSync(OVERLAY_FILE) ? [OVERLAY_FILE] : []
}

async function confirmStopOwners(port) {
  const owners = await findPortOwners(port)
  if (owners.length === 0) return { owners, yes: true }
  const names = owners.map((o) => `${o.name}(PID ${String(o.pid)})`).join('、')
  return askYesNo(
    [`  端口 ${String(port)} 被 ${names} 占用`, '', '  Enter 结束这些进程并继续 · Esc 取消'],
    'Enter 结束并继续 · Esc 取消',
  ).then((yes) => ({ owners, yes }))
}

async function actionStop() {
  const { owners, yes } = await confirmStopOwners(CONFIG.service.port)
  if (!yes) return false
  for (const { pid } of owners) await killTree(pid)
  return owners.length > 0
}

async function actionStart() {
  const c = ctx()
  const { owners, yes } = await confirmStopOwners(CONFIG.service.port)
  if (owners.length > 0 && !yes) return
  for (const { pid } of owners) await killTree(pid)
  const busy = busyLoop('准备中（安装/构建按需执行）')
  let service
  try {
    await runInstallBuild(CONFIG, { save: c.save, onLine: busy.push, installEnv: buildInstallEnv(CONFIG.presets.intranet) })
    busy.stop()
    const ready = busyLoop('正在启动 dsh web …')
    service = await startService({
      projectRoot: CONFIG.project.path,
      port: CONFIG.service.port,
      autoOpenBrowser: CONFIG.service.autoOpenBrowser,
      patches: overlayPatches(),
      env: buildLaunchEnv(CONFIG.presets.intranet),
      onLine: ready.push,
    })
    ready.stop()
    CONFIG.project.lastStartAt = Date.now()
    c.save()
    await tailView(service)
  } catch (error) {
    busy.stop()
    await showError(error)
  }
}

async function actionRestart() {
  await actionStop()
  await actionStart()
}

async function tailView(service) {
  let exited = false
  service.child.on('exit', () => { exited = true })
  return new Promise((resolve) => {
    let tail = [...service.tail]
    const feed = (chunk) => { for (const l of chunk.toString('utf8').split(/\r?\n/)) if (l.trim() !== '') { tail.push(l); if (tail.length > 300) tail.shift() } }
    service.child.stdout.on('data', feed)
    service.child.stderr.on('data', feed)
    const timer = setInterval(() => {
      paint([renderHeader('dsh 控制台 · 服务运行'), '',
        `  ${exited ? S.red + '● 服务已退出' + S.reset : S.green + '● ' + S.reset + service.url}`, renderRule(),
        ...tail.slice(-18).map((l) => `  ${S.dim}${l.slice(0, 120)}${S.reset}`), '',
        renderFooter('Esc 返回菜单（服务后台继续）')])
      if (exited) clearInterval(timer)
    }, 400)
    const stop = startInput((k) => {
      if (k.type === 'esc' || k.type === 'ctrl-c') { clearInterval(timer); stop(); resolve() }
    })
  })
}

async function showError(error) {
  const detail = String(error && error.message ? error.message : error)
  paint([renderHeader('dsh 控制台'), '', `  ${S.red}✗ ${detail.split('\n')[0].slice(0, 120)}${S.reset}`, '',
    renderFooter('Enter 查看详情 · Esc 返回')])
  await new Promise((resolve) => {
    const stop = startInput((k) => {
      if (k.type === 'enter') {
        stop()
        paint([renderHeader('dsh 控制台 · 错误详情'), '', ...detail.split('\n').slice(0, 25).map((l) => `  ${l.slice(0, 120)}`), '', renderFooter('Esc 返回')])
        const s2 = startInput(() => { s2(); resolve() })
      }
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve() }
    })
  })
}

async function offerRestart() {
  const owners = await findPortOwners(CONFIG.service.port)
  if (owners.length === 0) return
  const yes = await askYesNo(['  插件改动重启后生效。', ''], 'Enter 现在重启 · Esc 稍后')
  if (!yes) return
  await actionStop()
  await actionStart()
}

async function actionOpen() {
  const items = [
    { label: '打开 Web UI', target: `http://127.0.0.1:${String(CONFIG.service.port)}` },
    { label: '打开项目目录', target: CONFIG.project.path ?? '.' },
    { label: '打开 ~/.dsh 配置目录', target: DSH_HOME },
    { label: '打开工具日志目录', target: LOGS_DIR },
    { label: '返回', target: null },
  ]
  let sel = 0
  await new Promise((resolve) => {
    const draw = () => paint([renderHeader('dsh 控制台 · 快捷打开'), '', ...renderMenu({ items, selected: sel }), '', renderFooter('↑↓ 选择 · Enter 确认 · Esc 返回')])
    const stop = startInput((k) => {
      if (k.type === 'up') sel = (sel + items.length - 1) % items.length
      if (k.type === 'down') sel = (sel + 1) % items.length
      if (k.type === 'enter') { const t = items[sel].target; stop(); if (t) openPath(t); resolve() }
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve() }
      draw()
    })
    draw()
  })
}

async function actionSettings() {
  const items = () => [
    { label: `项目路径  ${CONFIG.project.path ?? '未设置'}` },
    { label: `端口      ${String(CONFIG.service.port)}` },
    { label: `启动开浏览器  ${CONFIG.service.autoOpenBrowser ? '开' : '关'}` },
    { label: '创建桌面快捷方式', hint: '在桌面生成 dsh 控制台.lnk' },
    { label: '返回' },
  ]
  for (;;) {
    const list = items()
    let sel = 0
    const pick = await new Promise((resolve) => {
      const draw = () => paint([renderHeader('dsh 控制台 · 工具设置'), '', ...renderMenu({ items: list, selected: sel }), '', renderFooter('Enter 编辑 · Esc 返回')])
      const stop = startInput((k) => {
        if (k.type === 'up') sel = (sel + list.length - 1) % list.length
        if (k.type === 'down') sel = (sel + 1) % list.length
        if (k.type === 'enter') { stop(); resolve(sel) }
        if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(-1) }
        draw()
      })
      draw()
    })
    if (pick === -1 || pick === 4) return
    if (pick === 0) {
      const input = await textInput({ prompt: '新项目路径' })
      if (input) {
        const v = validateProjectPath(input.trim())
        if (v.ok) { CONFIG.project.path = input.trim(); ctx().save() } else process.stdout.write(`\r\n  ${S.red}✗ ${v.reason}${S.reset}\r\n`)
      }
    }
    if (pick === 1) {
      const input = await textInput({ prompt: '新端口（1-65535）' })
      const p = Number(input)
      if (input && Number.isInteger(p) && p > 0 && p < 65536) { CONFIG.service.port = p; ctx().save() }
    }
    if (pick === 2) { CONFIG.service.autoOpenBrowser = !CONFIG.service.autoOpenBrowser; ctx().save() }
    if (pick === 3) {
      try {
        const link = await createDesktopShortcut(TOOL_ROOT)
        process.stdout.write(`\r\n  ${S.green}✓ 已创建：${link}${S.reset}\r\n`)
      } catch (error) {
        process.stdout.write(`\r\n  ${S.red}✗ ${String(error && error.message ? error.message : error).split('\n')[0]}${S.reset}\r\n`)
      }
    }
  }
}

function menuItems() {
  return [
    { label: '启动服务', hint: '安装/构建 · 启动 dsh web' },
    { label: '重启服务', hint: '停止后重新启动' },
    { label: '停止服务', hint: '结束占用端口的服务进程' },
    { label: '插件管理', hint: '启用/停用 · 系统与自定义分组' },
    { label: '模型与凭据', hint: '默认模型提供方配置' },
    { label: '启动预设（内网）', hint: '遥测/CA · 代理 · 镜像源' },
    { label: '项目更新', hint: 'pull → install → build → 重启' },
    { label: '日志与快捷打开', hint: 'Web UI / 项目 / 配置目录' },
    { label: '工具设置', hint: '项目路径 · 端口 · 快捷方式' },
    { label: '退出', hint: '' },
  ]
}

async function safeAction(name, fn) {
  try { await fn() } catch (error) { await showError(error) }
}

async function mainLoop() {
  for (;;) {
    const owners = await findPortOwners(CONFIG.service.port)
    const snap = statusSnapshot({ config: CONFIG, owners, settingsDoc: readSettingsDoc(DSH_HOME) })
    const items = menuItems()
    let sel = 0
    await new Promise((resolve) => {
      const draw = () => paint([
        renderHeader('dsh 控制台', 'v0.1.0'), '',
        renderStatusRow('项目', String(CONFIG.project.path ?? '未设置')),
        renderStatusRow('服务', `${snap.service} · ${snap.url}`, owners.length > 0 ? 'ok' : 'off'),
        renderStatusRow('模型', snap.model),
        renderStatusRow('构建', snap.build),
        renderStatusRow('预设', snap.preset),
        renderRule(), '',
        ...renderMenu({ items, selected: sel }),
        '', renderFooter('↑↓ 选择 · Enter 确认 · q 退出'),
      ])
      const stop = startInput((k) => {
        if (k.type === 'up') sel = (sel + items.length - 1) % items.length
        if (k.type === 'down') sel = (sel + 1) % items.length
        if (k.type === 'enter') { stop(); resolve(sel) }
        if (k.type === 'ctrl-c' || (k.type === 'char' && k.ch === 'q')) { stop(); resolve(items.length - 1) }
        draw()
      })
      draw()
    })
    const last = items.length - 1
    if (sel === last) return
    if (sel === 0) await safeAction('启动', actionStart)
    if (sel === 1) await safeAction('重启', actionRestart)
    if (sel === 2) await safeAction('停止', async () => { await actionStop(); process.stdout.write(`\r\n  ${S.green}✓ 已停止${S.reset}\r\n`) })
    if (sel === 3) await safeAction('插件管理', () => pluginsPage(ctx(), { restartHook: offerRestart }))
    if (sel === 4) await safeAction('模型与凭据', () => modelPage(ctx()))
    if (sel === 5) await safeAction('启动预设', () => presetsPage(ctx()))
    if (sel === 6) await safeAction('项目更新', () => updatePage(ctx(), { restartHook: offerRestart }))
    if (sel === 7) await safeAction('快捷打开', actionOpen)
    if (sel === 8) await safeAction('工具设置', actionSettings)
  }
}

export async function run() {
  ensurePathForChildren()
  let config = loadConfig(CONFIG_FILE)
  if (config === null) {
    config = structuredClone(DEFAULT_CONFIG)
    CONFIG = config
    await wizardPage(ctx())
    CONFIG = loadConfig(CONFIG_FILE)
  }
  CONFIG = CONFIG ?? config
  // 上次任务未正常结束提示
  if (existsSync(IN_FLIGHT)) {
    let label = ''
    try { label = String(JSON.parse(readFileSync(IN_FLIGHT, 'utf8')).label ?? '') } catch { label = '' }
    await askYesNo([`  上次${label === '' ? '操作' : '“' + label + '”'}未正常结束。`, '  可查看日志后重试。', ''], 'Enter 查看日志目录 · Esc 继续').then(async (yes) => {
      if (yes) openPath(LOGS_DIR)
    })
    clearInFlight()
  }
  await mainLoop()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().then(() => process.exit(0), (error) => { console.error(error); process.exit(1) })
}
