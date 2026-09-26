/** 更新：source 走 git pull → install → build；npm 走 npm install -g @deepseek-ai/dsh@latest。 */
import { S } from '../ui/ansi.js'
import { startInput } from '../ui/input.js'
import { renderFooter, renderHeader, renderRule, SPINNER } from '../ui/components.js'
import { paint } from '../ui/screen.js'
import { dshVersionOf, gitHeadOf, runCommand } from '../core/lifecycle.js'
import { runInstallBuild } from '../core/pipeline.js'
import { buildInstallEnv } from '../core/presets.js'
import { pause } from './shared.js'

/** npm 全局模式：npm install -g @deepseek-ai/dsh@latest，按版本前后对比报告结果。 */
async function updateNpm(ctx, { restartHook }) {
  const before = await dshVersionOf({ mode: 'npm' })
  let frame = 0
  const tail = []
  const timer = setInterval(() => paint([renderHeader('项目更新'), renderRule(), '',
    `  ${S.accent}${SPINNER[frame++ % SPINNER.length]}${S.reset} npm install -g @deepseek-ai/dsh@latest`, '',
    ...tail.slice(-10).map((l) => `  ${S.dim}${l.slice(0, 110)}${S.reset}`), '']), 150)
  const r = await runCommand({ cmd: 'npm', args: ['install', '-g', '@deepseek-ai/dsh@latest'], onLine: (l) => tail.push(l) })
  clearInterval(timer)
  if (r.code !== 0) {
    paint([renderHeader('项目更新'), '', `  ${S.red}✗ npm 更新失败${S.reset}`, ...r.tail.slice(-6).map((l) => `  ${l.slice(0, 110)}`), '', renderFooter('Enter 返回')])
    await pause('Enter 返回')
    return
  }
  const after = await dshVersionOf({ mode: 'npm' })
  if (before === after) {
    paint([renderHeader('项目更新'), '', `  ${S.green}✓${S.reset} 已是最新（${before ?? '未知'}）`, ''])
    await pause('Enter 返回')
    return
  }
  paint([renderHeader('项目更新'), '', `  ${S.green}✓${S.reset} ${String(before ?? '旧版本')} → ${String(after ?? '新版本')}，全局 dsh 已更新`, ''])
  if (restartHook) await restartHook()
}

export async function updatePage(ctx, { restartHook } = {}) {
  if (ctx.config.launch?.mode === 'npm') return updateNpm(ctx, { restartHook })
  const root = ctx.config.project.path
  const dirty = await runCommand({ cmd: 'git', args: ['-C', root, 'status', '--porcelain'] })
  if (dirty.code === 0 && dirty.tail.length > 0) {
    paint([renderHeader('项目更新'), '', `  ${S.yellow}· 工作树有未提交改动，硬拉可能冲突${S.reset}`, '', renderFooter('Enter 继续 pull --ff-only · Esc 取消')])
    const yes = await new Promise((resolve) => {
      const stop = startInput((k) => { if (k.type === 'enter') { stop(); resolve(true) } if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(false) } })
    })
    if (!yes) return
  }
  const before = await gitHeadOf(root)
  let frame = 0
  const tail = []
  const timer = setInterval(() => paint([renderHeader('项目更新'), renderRule(), '',
    `  ${S.accent}${SPINNER[frame++ % SPINNER.length]}${S.reset} git pull`, '',
    ...tail.slice(-10).map((l) => `  ${S.dim}${l.slice(0, 110)}${S.reset}`), '']), 150)
  const pulled = await runCommand({ cmd: 'git', args: ['-C', root, 'pull', '--ff-only'], onLine: (l) => tail.push(l) })
  clearInterval(timer)
  if (pulled.code !== 0) {
    paint([renderHeader('项目更新'), '', `  ${S.red}✗ pull 失败${S.reset}`, ...pulled.tail.slice(-6).map((l) => `  ${l.slice(0, 110)}`), '', renderFooter('Enter 返回')])
    await pause('Enter 返回')
    return
  }
  const after = await gitHeadOf(root)
  if (before === after) {
    paint([renderHeader('项目更新'), '', `  ${S.green}✓${S.reset} 已是最新（${String(after).slice(0, 7)}）`, ''])
    await pause('Enter 返回')
    return
  }
  await runInstallBuild(ctx.config, { save: ctx.save, installEnv: buildInstallEnv(ctx.config.presets.intranet) })
  paint([renderHeader('项目更新'), '', `  ${S.green}✓${S.reset} ${String(before).slice(0, 7)} → ${String(after).slice(0, 7)}，已安装并重建`, ''])
  if (restartHook) await restartHook()
}