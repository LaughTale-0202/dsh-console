#!/usr/bin/env node
/** dsh 控制台主程序：装配 UI、config 与生命周期（状态首页 / 启动重启 / 插件 / 模型 / 预设 / 更新）。 */
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { S } from './ui/ansi.js'
import { startInput, textInput, digitSelect } from './ui/input.js'
import { renderFooter, renderHeader, renderMenu, renderRule, renderStatusRow, SPINNER } from './ui/components.js'
import { paint } from './ui/screen.js'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from './core/config.js'
import { findPortOwners, killTree } from './core/port.js'
import { dshVersionOf, startService } from './core/lifecycle.js'
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
let dshVersionCache = null

/** npm 模式刷新全局 dsh 版本缓存（source 模式清空）。 */
async function refreshDshVersion() {
  if (CONFIG.launch?.mode !== 'npm') { dshVersionCache = null; return }
  dshVersionCache = await dshVersionOf({ mode: 'npm' }).catch(() => null)
}

function npmGlobalRoot() {
  return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm')
}

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
  // 探测会起 PowerShell，先给即时反馈再等结果。
  paint([renderHeader('dsh 控制台'), '', `  ${S.cyan}⠹ 正在检测端口 ${String(port)} 占用…${S.reset}`, ''])
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
  const npmMode = CONFIG.launch?.mode === 'npm'
  const busy = busyLoop(npmMode ? '准备启动…' : '准备中（安装/构建按需执行）')
  let service
  try {
    if (!npmMode) {
      await runInstallBuild(CONFIG, { save: c.save, onLine: busy.push, installEnv: buildInstallEnv(CONFIG.presets.intranet) })
    }
    busy.stop()
    const ready = busyLoop('正在启动 dsh web …')
    service = await startService({
      mode: CONFIG.launch?.mode,
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
  // 一帧的固定开销行：标题、空行、URL 行、分隔线、空行、底栏 = 6 行。
  // paint 落盘时会再写一个收尾换行，故再留 1 行余量，保证整帧 ≤ 一屏且不触底，
  // 这样每次重绘都原地刷新，绝不把旧帧挤进滚动缓冲造成“越滚越多”。
  const rows = typeof process.stdout.rows === 'number' && process.stdout.rows > 7 ? process.stdout.rows : 24
  const maxTail = rows - 7
  let exited = false
  let dirty = true
  const tail = [...service.tail]
  const draw = () => {
    if (!dirty) return
    dirty = false
    paint([renderHeader('dsh 控制台 · 服务运行'), '',
      `  ${exited ? S.red + '● 服务已退出' + S.reset : S.green + '● ' + S.reset + service.url}`, renderRule(),
      ...tail.slice(-maxTail).map((l) => `  ${S.dim}${l.slice(0, 120)}${S.reset}`), '',
      renderFooter('Esc 返回菜单（服务后台继续）')])
  }
  const feed = (chunk) => {
    let changed = false
    for (const l of chunk.toString('utf8').split(/\r?\n/)) {
      if (l.trim() === '') continue
      tail.push(l)
      if (tail.length > 300) tail.shift()
      changed = true
    }
    if (changed) { dirty = true; draw() }
  }
  service.child.stdout.on('data', feed)
  service.child.stderr.on('data', feed)
  service.child.on('exit', () => { exited = true; dirty = true; draw() })
  draw()
  return new Promise((resolve) => {
    const stop = startInput((k) => {
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve() }
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
  paint([renderHeader('插件管理'), '', `  ${S.cyan}⠹ 正在检测服务端口…${S.reset}`, ''])
  const owners = await findPortOwners(CONFIG.service.port)
  if (owners.length === 0) return
  const yes = await askYesNo(['  插件改动重启后生效。', ''], 'Enter 现在重启 · Esc 稍后')
  if (!yes) return
  await actionStop()
  await actionStart()
}

async function actionOpen() {
  const npmMode = CONFIG.launch?.mode === 'npm'
  const items = [
    { label: '打开 Web UI', target: `http://127.0.0.1:${String(CONFIG.service.port)}` },
    { label: npmMode ? '打开 npm 全局目录' : '打开项目目录', target: npmMode ? npmGlobalRoot() : CONFIG.project.path ?? '.' },
    { label: '打开 ~/.dsh 配置目录', target: DSH_HOME },
    { label: '打开工具日志目录', target: LOGS_DIR },
    { label: '返回', target: null },
  ]
  let sel = 0
  await new Promise((resolve) => {
    const draw = () => paint([renderHeader('dsh 控制台 · 快捷打开'), '', ...renderMenu({ items, selected: sel }), '', renderFooter('↑↓ / 数字 选择 · Enter 确认 · Esc 返回')])
    const stop = startInput((k) => {
      if (k.type === 'up') sel = (sel + items.length - 1) % items.length
      if (k.type === 'down') sel = (sel + 1) % items.length
      const d = digitSelect(k, items.length); if (d >= 0) sel = d
      if (k.type === 'enter') { const t = items[sel].target; stop(); if (t) openPath(t); resolve() }
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve() }
      draw()
    })
    draw()
  })
}

async function actionSettings() {
  const items = () => [
    { label: `启动方式  ${CONFIG.launch?.mode === 'npm' ? 'npm 全局' : '本地源码'}` },
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
      const draw = () => paint([renderHeader('dsh 控制台 · 工具设置'), '', ...renderMenu({ items: list, selected: sel }), '', renderFooter('↑↓ / 数字 选择 · Enter 编辑 · Esc 返回')])
      const stop = startInput((k) => {
        if (k.type === 'up') sel = (sel + list.length - 1) % list.length
        if (k.type === 'down') sel = (sel + 1) % list.length
        const d = digitSelect(k, list.length); if (d >= 0) sel = d
        if (k.type === 'enter') { stop(); resolve(sel) }
        if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(-1) }
        draw()
      })
      draw()
    })
    if (pick === -1 || pick === 5) return
    if (pick === 0) {
      // 切换启动方式：npm <-> source。切到 source 且没项目路径时先要求填路径。
      const next = CONFIG.launch?.mode === 'npm' ? 'source' : 'npm'
      if (next === 'source' && !CONFIG.project.path) {
        const input = await textInput({ prompt: '本地源码模式需要项目路径' })
        if (input === null) continue
        const v = validateProjectPath(input.trim())
        if (!v.ok) { process.stdout.write(`\r\n  ${S.red}✗ ${v.reason}${S.reset}\r\n`); continue }
        CONFIG.project.path = input.trim()
      }
      CONFIG.launch.mode = next
      ctx().save()
      await refreshDshVersion()
    }
    if (pick === 1) {
      const input = await textInput({ prompt: '新项目路径' })
      if (input) {
        const v = validateProjectPath(input.trim())
        if (v.ok) { CONFIG.project.path = input.trim(); ctx().save() } else process.stdout.write(`\r\n  ${S.red}✗ ${v.reason}${S.reset}\r\n`)
      }
    }
    if (pick === 2) {
      const input = await textInput({ prompt: '新端口（1-65535）' })
      const p = Number(input)
      if (input && Number.isInteger(p) && p > 0 && p < 65536) { CONFIG.service.port = p; ctx().save() }
    }
    if (pick === 3) { CONFIG.service.autoOpenBrowser = !CONFIG.service.autoOpenBrowser; ctx().save() }
    if (pick === 4) {
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
    { label: '插件管理', hint: '启停 · 系统/自定义 区分与过滤' },
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

/** 服务占用缓存：避免每次重绘主菜单都阻塞在慢速 PowerShell 探测上。
 * value 为最近一次成功结果；refresh 返回时若当前仍在该菜单实例则回调 repaint。
 * 内部自吞错误，永不抛未处理拒绝（否则 Node ≥15 会直接终止进程导致“闪退”）。 */
const ownersCache = { value: [], pending: null, lastError: null }

async function probeServiceOwners() {
  if (ownersCache.pending === null) {
    ownersCache.pending = findPortOwners(CONFIG.service.port)
      .then((o) => { ownersCache.value = Array.isArray(o) ? o : []; ownersCache.lastError = null; return ownersCache.value })
      .catch((e) => { ownersCache.lastError = e; ownersCache.value = [] })
      .finally(() => { ownersCache.pending = null })
  }
  return ownersCache.pending
}

async function mainLoop() {
  // 首次进入先在后台预取一次，避免首屏冻结；value 为空表示尚在探测。
  probeServiceOwners().catch(() => {})
  for (;;) {
    const items = menuItems()
    let sel = 0
    let menuOpen = true
    let stopInputFn = null
    const snap = () => statusSnapshot({ config: CONFIG, owners: ownersCache.value, settingsDoc: readSettingsDoc(DSH_HOME), dshVersion: dshVersionCache })
    const draw = () => {
      const s = snap()
      paint([
        renderHeader('dsh 控制台', 'v0.1.0'), '',
        renderStatusRow('项目', CONFIG.launch?.mode === 'npm' ? `npm 全局${dshVersionCache ? `（${dshVersionCache}）` : ''}` : String(CONFIG.project.path ?? '未设置')),
        renderStatusRow('服务', `${s.service} · ${s.url}`, ownersCache.value.length > 0 ? 'ok' : 'off'),
        renderStatusRow('模型', s.model),
        renderStatusRow('构建', s.build),
        renderStatusRow('预设', s.preset),
        renderRule(), '',
        ...renderMenu({ items, selected: sel }),
        '', renderFooter('↑↓ / 数字 选择 · Enter 确认 · q 退出'),
      ])
    }
    const close = () => { menuOpen = false; stopInputFn?.() }
    const pick = await new Promise((resolve) => {
      stopInputFn = startInput((k) => {
        if (k.type === 'up') sel = (sel + items.length - 1) % items.length
        if (k.type === 'down') sel = (sel + 1) % items.length
        const d = digitSelect(k, items.length); if (d >= 0) sel = d
        if (k.type === 'enter') { close(); resolve(sel) }
        if (k.type === 'ctrl-c' || (k.type === 'char' && k.ch === 'q')) { close(); resolve(items.length - 1) }
        draw()
      })
      // 后台刷新占用状态；期间仍在主菜单则原位刷新“服务”行，避免回菜单时先卡等探测。
      probeServiceOwners().then(() => { if (menuOpen) draw() }).catch(() => {})
      draw()
    })
    const last = items.length - 1
    if (pick === last) return
    if (pick === 0) await safeAction('启动', actionStart)
    if (pick === 1) await safeAction('重启', actionRestart)
    if (pick === 2) await safeAction('停止', async () => { await actionStop(); process.stdout.write(`\r\n  ${S.green}✓ 已停止${S.reset}\r\n`) })
    if (pick === 3) await safeAction('插件管理', () => pluginsPage(ctx(), { restartHook: offerRestart }))
    if (pick === 4) await safeAction('模型与凭据', () => modelPage(ctx()))
    if (pick === 5) await safeAction('启动预设', () => presetsPage(ctx()))
    if (pick === 6) await safeAction('项目更新', async () => { await updatePage(ctx(), { restartHook: offerRestart }); await refreshDshVersion() })
    if (pick === 7) await safeAction('快捷打开', actionOpen)
    if (pick === 8) await safeAction('工具设置', actionSettings)
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
  await refreshDshVersion()
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
  // 任何未捕获错误/未处理拒绝都不允许“无提示闪退”：写日志、保留窗口再退出。
  const fatal = (kind, error) => {
    try {
      const text = `[${new Date().toISOString()}] ${kind}: ${String(error && error.stack ? error.stack : error)}\n`
      mkdirSync(LOGS_DIR, { recursive: true })
      appendFileSync(join(LOGS_DIR, 'fatal.log'), text, 'utf8')
      process.stdout.write(`\r\n  ${S.red}✗ 程序异常退出（${kind}）：${S.reset}${String(error && error.message ? error.message : error).split('\n')[0]}\r\n  ${S.dim}详情见 data/logs/fatal.log${S.reset}\r\n`)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode?.(false)
      }
    } catch { /* 兜底：仍退出 */ }
    process.exit(1)
  }
  process.on('unhandledRejection', (reason) => fatal('未处理的 Promise 拒绝', reason))
  process.on('uncaughtException', (error) => fatal('未捕获异常', error))
  run().then(() => process.exit(0), (error) => fatal('启动失败', error))
}
