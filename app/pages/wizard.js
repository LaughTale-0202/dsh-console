/** 首次运行向导（规格 §8）：位置 → 环境 → 构建 → 可选模型。 */
import { S } from '../ui/ansi.js'
import { startInput, textInput, digitSelect } from '../ui/input.js'
import { renderFooter, renderHeader, renderRule, renderMenu, SPINNER } from '../ui/components.js'
import { paint } from '../ui/screen.js'
import { pickFolder } from '../core/native.js'
import { runInstallBuild } from '../core/pipeline.js'
import { validateProjectPath } from './status.js'
import { modelPage } from './model.js'
import { awaitEnter } from './shared.js'
import { buildInstallEnv } from '../core/presets.js'

const head = (step) => renderHeader('dsh 控制台 · 首次运行向导', step)

export async function wizardPage(ctx) {
  // —— 1/4 项目位置 ——
  paint([head('1/4'), renderRule(), '', '  项目位置', '', '  告诉我 deepseek-harness 项目在哪里。', ''])
  const way = await new Promise((resolve) => {
    const items = [{ label: '浏览选择文件夹…', hint: '系统对话框' }, { label: '手动输入路径', hint: '粘贴完整路径' }]
    let sel = 0
    const draw = () => paint([head('1/4'), renderRule(), '', ...renderMenu({ items, selected: sel }), '', renderFooter('↑↓ / 数字 选择 · Enter 确认 · Esc 退出')])
    const stop = startInput((k) => {
      if (k.type === 'up') sel = (sel + items.length - 1) % items.length
      if (k.type === 'down') sel = (sel + 1) % items.length
      const d = digitSelect(k, items.length); if (d >= 0) sel = d
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
    paint([head('1/4'), renderRule(), '', `  ${S.red}✗ ${v.reason}${S.reset}`, ''])
    const again = await textInput({ prompt: '重新输入路径（Esc 退出）' })
    if (again === null) process.exit(0)
    root = again.trim()
  }
  ctx.config.project.path = root
  ctx.save()

  // —— 2/4 环境（引导阶段已确保 Node） ——
  paint([head('2/4'), renderRule(), '', `  ${S.green}✓${S.reset} Node ${process.version}（引导阶段已检查）`, '', renderFooter('Enter 继续')])
  await awaitEnter()

  // —— 3/4 安装与构建 ——
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
