/** 插件管理页（规格 §6）：系统/自定义分组、空格启停、核心行二次确认、改动重启生效提示。 */
import { S, padEnd, truncate } from '../ui/ansi.js'
import { startInput } from '../ui/input.js'
import { renderFooter, renderHeader, renderRule } from '../ui/components.js'
import { paint } from '../ui/screen.js'
import { runPnpm } from '../core/lifecycle.js'
import { CORE_ROW_IDS, parseDump, writeOverlay, upsertCacheEntry, dropCacheEntry, classifyRow, describeRow } from '../core/plugins.js'

const ORIGIN_TAG = { system: '系统', custom: '自定义' }

/** 拉取当前 web 组合（不含本工具 overlay，反映官方默认 + 用户 ~/.dsh patch）。 */
export async function gatherRows(ctx) {
  const r = await runPnpm({ projectRoot: ctx.config.project.path, args: ['dsh', 'web', '--dump-config'], maxTail: 0 })
  if (r.code !== 0) throw new Error(`dump-config 失败：\n${r.tail.slice(-6).join('\n')}`)
  return parseDump(r.tail.join('\n'))
}

/** 构建显示行：分类/描述各算一次并缓存；状态 = 用户意图优先，其次官方默认。 */
function buildView(rows, cacheMap, projectRoot, memo) {
  return rows.map((row) => {
    const mm = memo[row.id]
    const entry = cacheMap.get(row.id)
    let state
    if (entry?.mode === 'off') state = 'off-user'
    else if (entry?.mode === 'on') state = 'on'
    else state = row.disabled === true ? 'off-official' : 'on'
    return {
      id: row.id,
      name: entry?.name ?? row.name ?? row.id,
      origin: mm.origin,
      description: mm.description,
      state,
    }
  })
}

export async function pluginsPage(ctx, { restartHook } = {}) {
  const rows = await gatherRows(ctx)
  const root = ctx.config.project.path
  // 预计算 origin/description（pkgDir 扫描只做一次）
  const memo = {}
  for (const row of rows) memo[row.id] = {
    origin: classifyRow(row, root),
    description: describeRow(row, root) ?? '',
  }
  let tab = 'system'
  let sel = 0
  for (;;) {
    const cacheMap = new Map(ctx.config.plugins.disabled.map((e) => [e.id, e]))
    const view = buildView(rows, cacheMap, root, memo)
    const missing = ctx.config.plugins.disabled.filter((e) => !rows.some((r) => r.id === e.id))
    const items = view.filter((v) => v.origin === tab)
    const selId = items[sel]?.id
    const draw = () => paint([
      renderHeader('插件管理',
        `系统 ${String(view.filter((v) => v.origin === 'system').length)} · 自定义 ${String(view.filter((v) => v.origin === 'custom').length)} · 已停用 ${String(view.filter((v) => v.state !== 'on').length)}`),
      renderRule(),
      ...items.map((v) => {
        const dot = v.state === 'on' ? `${S.green}●${S.reset}` : v.state === 'off-user' ? `${S.yellow}○${S.reset}` : `${S.dim}○${S.reset}`
        const on = v.id === selId
        const cursor = on ? `${S.accent}❯${S.reset} ` : '  '
        const label = on ? `${S.bold}${padEnd(truncate(v.id, 20), 20)}${S.reset}` : padEnd(truncate(v.id, 20), 20)
        const desc = v.description === '' ? `${S.dim}${padEnd('', 34)}${S.reset}` : `${S.dim}${padEnd(truncate(v.description, 34), 34)}${S.reset}`
        const tag = v.state === 'off-user' ? `${S.yellow}· 我停用${S.reset}` : v.state === 'off-official' ? `${S.dim}· 官方默认关${S.reset}` : ''
        return `  ${cursor} ${dot} ${label} ${desc}${tag}`
      }),
      ...(tab === 'custom' && missing.length > 0
        ? ['', `  ${S.dim}已缓存（当前组合不存在）：${missing.map((m) => m.id).join('、')}${S.reset}`]
        : []),
      '', renderFooter('空格 启停 · Tab 切换 系统/自定义 · Esc 返回 · 改动重启后生效'),
    ])
    const action = await new Promise((resolve) => {
      const stop = startInput((k) => {
        if (k.type === 'up') sel = (sel + items.length - 1) % Math.max(1, items.length)
        if (k.type === 'down') sel = (sel + 1) % Math.max(1, items.length)
        if (k.type === 'tab') { stop(); resolve('switch') }
        if (k.type === 'space' && items.length > 0) { stop(); resolve(items[sel]) }
        if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve('exit') }
        draw()
      })
      draw()
    })
    if (action === 'exit') return
    if (action === 'switch') { tab = tab === 'system' ? 'custom' : 'system'; sel = 0; continue }
    if (action === undefined) continue
    const v = action
    const cache = ctx.config.plugins.disabled
    const entry = cache.find((e) => e.id === v.id)
    const turningOff = v.state === 'on'
    if (turningOff && CORE_ROW_IDS.includes(v.id)) {
      paint([renderHeader('插件管理'), '', `  ${S.red}✗ ${v.id} 是核心骨架行，禁用后服务可能无法启动。`, '', renderFooter('Enter 仍要禁用 · Esc 取消')])
      const sure = await new Promise((resolve) => {
        const stop = startInput((k) => { if (k.type === 'enter') { stop(); resolve(true) } if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(false) } })
      })
      if (!sure) { sel = Math.max(0, sel); continue }
    }
    if (turningOff) {
      ctx.config.plugins.disabled = upsertCacheEntry(cache, {
        id: v.id, name: v.name, origin: v.origin, note: entry?.note ?? null, at: new Date().toISOString(), mode: 'off',
      })
    } else if (v.state === 'off-user') {
      ctx.config.plugins.disabled = dropCacheEntry(cache, v.id)
    } else {
      ctx.config.plugins.disabled = upsertCacheEntry(cache, {
        id: v.id, name: v.name, origin: v.origin, note: null, at: new Date().toISOString(), mode: 'on',
      })
    }
    ctx.save()
    writeOverlay(ctx.overlayFile, ctx.config.plugins.disabled)
    process.stdout.write(`\r\n  ${S.green}✓ 已更新；${S.reset}改动在下次启动时生效\r\n`)
    if (restartHook) await restartHook()
    sel = Math.min(sel, Math.max(0, items.length - 1))
  }
}
