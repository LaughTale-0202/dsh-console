/** 首次运行向导（规格 §8）：启动方式 → 位置（源码）→ 环境/构建 → 可选模型。 */
import { S } from '../ui/ansi.js'
import { startInput, textInput } from '../ui/input.js'
import { renderFooter, renderHeader, renderRule, renderMenu, SPINNER } from '../ui/components.js'
import { paint } from '../ui/screen.js'
import { pickFolder } from '../core/native.js'
import { runInstallBuild } from '../core/pipeline.js'
import { dshVersionOf } from '../core/lifecycle.js'
import { validateProjectPath } from './status.js'
import { modelPage } from './model.js'
import { awaitEnter } from './shared.js'
import { buildInstallEnv } from '../core/presets.js'

const head = (step) => renderHeader('dsh 控制台 · 首次运行向导', step)

/** 二选一启动方式。npm=全局安装免构建；source=本地检出需安装/构建。 */
function pickLaunchMode() {
  paint([head('1/4'), renderRule(), '', '  启动方式', '',
    '  怎么运行 dsh？两种方式使用同一套 Web UI 与 ~/.dsh 配置。', ''])
  const items = [
    { label: 'npm 全局安装', hint: 'dsh web · 免安装/构建 · 推荐' },
    { label: '本地源码检出', hint: 'pnpm dsh web · 需安装/构建/更新' },
  ]
  return new Promise((resolve) => {
    let sel = 0
    const draw = () => paint([head('1/4'), renderRule(), '', ...renderMenu({ items, selected: sel }), '', renderFooter('↑↓ / 数字 选择 · Enter 确认 · Esc 退出')])
    const stop = startInput((k) => {
      if (k.type === 'up') sel = (sel + items.length - 1) % items.length
      if (k.type === 'down') sel = (sel + 1) % items.length
      const d = /^[1-9]$/.test(k.ch ?? '') ? Number(k.ch) - 1 : -1; if (d >= 0 && d < items.length) sel = d
      if (k.type === 'enter') { stop(); resolve(sel) }
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(-1) }
      draw()
    })
    draw()
  })
}

/** npm 模式：确认全局 dsh 可用并返回版本；不可用时提示安装并退出。 */
async function checkNpmDsh(ctx) {
  ctx.config.launch.mode = 'npm'
  ctx.save()
  const version = await dshVersionOf({ mode: 'npm' })
  if (version !== null) {
    paint([head('2/4'), renderRule(), '', `  ${S.green}✓${S.reset} 已找到全局 dsh ${version}`, '',
      `  ${S.dim}安装：npm install -g @deepseek-ai/dsh@latest${S.reset}`, '', renderFooter('Enter 继续')])
    await awaitEnter()
    return version
  }
  paint([head('2/4'), renderRule(), '', `  ${S.red}✗${S.reset} 未找到可用的全局 dsh。`, '',
    '  请先在系统终端安装：', `  ${S.accent}npm install -g @deepseek-ai/dsh@latest${S.reset}`, '',
    '  然后重新运行本向导。', '', renderFooter('Enter 返回')])
  await awaitEnter()
  process.exit(1)
}

async function pickSourceProject(ctx) {
  paint([head('2/4'), renderRule(), '', '  项目位置', '', '  告诉我 deepseek-harness 项目在哪里。', ''])
  const way = await new Promise((resolve) => {
    const items = [{ label: '浏览选择文件夹…', hint: '系统对话框' }, { label: '手动输入路径', hint: '粘贴完整路径' }]
    let sel = 0
    const draw = () => paint([head('2/4'), renderRule(), '', ...renderMenu({ items, selected: sel }), '', renderFooter('↑↓ / 数字 选择 · Enter 确认 · Esc 退出')])
    const stop = startInput((k) => {
      if (k.type === 'up') sel = (sel + items.length - 1) % items.length
      if (k.type === 'down') sel = (sel + 1) % items.length
      const d = /^[1-9]$/.test(k.ch ?? '') ? Number(k.ch) - 1 : -1; if (d >= 0 && d < items.length) sel = d
      if (k.type === 'enter') { stop(); resolve(sel) }
      if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(-1) }
      draw()
    })
    draw()
  })
  if (way === -1) process.exit(0)
  let root = null
  if (way === 0) { root = await pickFolder(); if (!root) process.exit(0) }
  else { const inp = await textInput({ prompt: '项目路径' }); if (inp === null) process.exit(0); root = inp.trim() }
  for (;;) {
    const v = validateProjectPath(root)
    if (v.ok) break
    paint([head('2/4'), renderRule(), '', `  ${S.red}✗ ${v.reason}${S.reset}`, ''])
    const again = await textInput({ prompt: '重新输入路径（Esc 退出）' })
    if (again === null) process.exit(0)
    root = again.trim()
  }
  ctx.config.launch.mode = 'source'
  ctx.config.project.path = root
  ctx.save()
}

export async function wizardPage(ctx) {
  const mode = await pickLaunchMode()
  if (mode === -1) process.exit(0)
  if (mode === 0) {
    // —— npm 全局：无本地检出，跳过项目位置与安装/构建 ——
    await checkNpmDsh(ctx)
    paint([head('3/4'), renderRule(), '', `  ${S.green}✓${S.reset} 无需安装与构建（全局安装已就绪）`, '', renderFooter('Enter 继续')])
    await awaitEnter()
  } else {
    // —— 本地源码：项目位置 → 环境 → 安装/构建 ——
    await pickSourceProject(ctx)
    paint([head('3/4'), renderRule(), '', `  ${S.green}✓${S.reset} Node ${process.version}（引导阶段已检查）`, '', renderFooter('Enter 继续')])
    await awaitEnter()
    let frame = 0
    const tail = []
    const timer = setInterval(() => paint([head('3/4'), renderRule(), '',
      `  ${S.accent}${SPINNER[frame++ % SPINNER.length]}${S.reset} 安装与构建（首次必须，之后不再重复）`, '',
      ...tail.slice(-12).map((l) => `  ${S.dim}${l.slice(0, 110)}${S.reset}`), '']), 150)
    try {
      await runInstallBuild(ctx.config, { save: ctx.save, onLine: (l) => tail.push(l), installEnv: buildInstallEnv(ctx.config.presets.intranet) })
    } finally {
      clearInterval(timer)
    }
    paint([head('3/4'), renderRule(), '', `  ${S.green}✓${S.reset} 构建完成`, ''])
  }

  // —— 4/4 可选默认模型 ——
  paint([head('4/4'), renderRule(), '',
    '  要现在配置默认模型提供方吗？（可跳过，之后在「模型与凭据」里配置）', ''])
  const yes = await new Promise((resolve) => {
    const stop = startInput((k) => {
      if (k.type === 'enter') { stop(); resolve(true) }
      if (k.type === 'esc' || k.type === 'ctrl-c' || k.type === 'space') { stop(); resolve(false) }
    })
  })
  if (yes) await modelPage(ctx)
  ctx.config.wizard.completedAt = new Date().toISOString()
  ctx.save()
}