/** 插件管理页：合并展示系统/自定义插件，来源以符号+颜色区分；过滤、数字跳转、底部详情行。 */
import { S, padEnd, truncate, stringWidth } from '../ui/ansi.js'
import { startInput, digitSelect } from '../ui/input.js'
import { renderFooter, renderHeader, renderRule } from '../ui/components.js'
import { paint } from '../ui/screen.js'
import { runPnpm } from '../core/lifecycle.js'
import { CORE_ROW_IDS, parseDump, writeOverlay, upsertCacheEntry, dropCacheEntry, classifyRow, describeRow } from '../core/plugins.js'

const ORIGIN_META = {
  system: { name: '系统', sym: `${S.cyan}◈${S.reset}` },
  custom: { name: '自定义', sym: `${S.yellow}◆${S.reset}` },
}
/** 过滤模式顺序；Tab 依次循环，字母 a/s/c 直接跳到对应模式。 */
const FILTERS = [
  { key: 'all', name: '全部', letter: 'a' },
  { key: 'system', name: '系统', letter: 's' },
  { key: 'custom', name: '自定义', letter: 'c' },
]

/** 按显示列宽把一段文本折行（保留换行），避免长说明撑破屏幕。 */
function wrapText(text, cols) {
  const lines = []
  for (const raw of String(text ?? '').split(/\n/)) {
    const words = raw.split(/(\s+)/)
    let cur = ''
    for (const w of words) {
      if (w === '') continue
      if (cur === '') { cur = w; continue }
      if (stringWidth(cur) + stringWidth(w) > cols) { lines.push(cur); cur = w } else cur += w
    }
    if (cur !== '') lines.push(cur)
  }
  return lines
}

/** 拉取当前 web 组合（不含本工具 overlay，反映官方默认 + 用户 ~/.dsh patch）。
 * 解析只用 stdout：pnpm 的横幅/警告在 stderr，混入会破坏 YAML。 */
export async function gatherRows(ctx) {
  const r = await runPnpm({ projectRoot: ctx.config.project.path, args: ['dsh', 'web', '--dump-config'], maxTail: 0 })
  if (r.code !== 0) throw new Error(`dump-config 失败：\n${r.tail.slice(-6).join('\n')}`)
  const text = (r.stdoutLines?.length ?? 0) > 0 ? r.stdoutLines.join('\n') : r.tail.join('\n')
  return parseDump(text)
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

function stateDot(state) {
  if (state === 'on') return `${S.green}●${S.reset}`
  if (state === 'off-user') return `${S.yellow}○${S.reset}`
  return `${S.dim}○${S.reset}`
}

function stateName(state) {
  if (state === 'on') return `${S.green}启用${S.reset}`
  if (state === 'off-user') return `${S.yellow}已停用${S.reset}`
  return `${S.dim}官方默认关闭${S.reset}`
}

export async function pluginsPage(ctx, { restartHook } = {}) {
  // 先给即时反馈：dump 需要跑子进程，避免停在上一屏像是卡住。
  paint([renderHeader('插件管理', '读取中…'), '', `  ${S.cyan}⠹ 正在读取插件列表…${S.reset}`, ''])
  const rows = await gatherRows(ctx)
  const root = ctx.config.project.path
  // 预计算 origin/description（pkgDir 扫描只做一次）
  const memo = {}
  for (const row of rows) memo[row.id] = {
    origin: classifyRow(row, root),
    description: describeRow(row, root) ?? '',
  }
  let filter = 'all'
  let sel = 0
  for (;;) {
    const cacheMap = new Map(ctx.config.plugins.disabled.map((e) => [e.id, e]))
    const view = buildView(rows, cacheMap, root, memo)
    const missing = ctx.config.plugins.disabled.filter((e) => !rows.some((r) => r.id === e.id))
    const items = view.filter((v) => (filter === 'all' ? true : v.origin === filter))
    if (sel > items.length - 1) sel = Math.max(0, items.length - 1)
    const counts = {
      total: view.length,
      system: view.filter((v) => v.origin === 'system').length,
      custom: view.filter((v) => v.origin === 'custom').length,
      off: view.filter((v) => v.state !== 'on').length,
    }
    const filterBar = `  ${FILTERS.map((f) => {
      const on = f.key === filter
      return on ? `${S.accent}▶${S.reset}${S.bold}${f.name}${S.reset}` : `${S.dim}${f.name}${S.reset}`
    }).join('   ')}   ${S.dim}(Tab 切换 · ${FILTERS.map((f) => `${f.letter}=${f.name}`).join(' ')} )${S.reset}`
    const legend = `  ${S.dim}来源：${S.reset}${S.cyan}◈${S.reset}${S.dim}系统 ${S.reset} ${S.yellow}◆${S.reset}${S.dim}自定义  ·  ● 启用   ○ 停用（黄=已停用 / 灰=默认关）${S.reset}`
    // 屏体必须在每次按键后用最新的 sel 重建，否则上下键/数字跳转只改 sel 不刷新显示。
    const render = () => {
      const current = items[sel]
      const digits = Math.max(1, String(items.length).length)
      const listRows = items.map((v, i) => {
        const on = i === sel
        const num = `${on ? S.accent : S.dim}${String(i + 1).padStart(digits)}.${S.reset}`
        const cursor = on ? `${S.accent}❯${S.reset}` : ' '
        const dot = stateDot(v.state)
        const sym = ORIGIN_META[v.origin]?.sym ?? `${S.dim}?${S.reset}`
        const idRaw = padEnd(truncate(v.id, 20), 20)
        const idCol = on ? `${S.inverse}${idRaw}${S.reset}` : idRaw
        let tail = ''
        if (v.state === 'off-user') tail = `${S.yellow}已停用${S.reset}`
        else if (v.state === 'off-official') tail = `${S.dim}默认关${S.reset}`
        else tail = `${S.dim}${truncate(v.description === '' ? '（无说明）' : v.description, 30)}${S.reset}`
        return `  ${cursor} ${num} ${dot} ${sym} ${idCol} ${tail}`
      })
      const lines = [
        renderHeader('插件管理',
          `全部 ${String(counts.total)} · 系统 ${String(counts.system)} · 自定义 ${String(counts.custom)} · 已停用 ${String(counts.off)}`),
        renderRule(),
        filterBar,
        legend,
        '',
        ...(items.length > 0
          ? listRows
          : [`  ${S.dim}（当前过滤下没有插件，请用 Tab 切换来源）${S.reset}`]),
        ...(missing.length > 0 && filter === 'custom'
          ? ['', `  ${S.dim}已缓存（当前组合不存在）：${missing.map((m) => m.id).join('、')}${S.reset}`]
          : []),
      ]
      if (current) {
        const meta = ORIGIN_META[current.origin]
        const desc = current.description === ''
          ? '（该插件未提供功能说明，可查看它的 package.json 中的 description 字段）'
          : current.description
        lines.push('')
        lines.push(`  ${S.dim}── 当前选中 · ${meta?.sym ?? ''}${current.id} ──${S.reset}`)
        lines.push(`  类型: ${meta?.name ?? current.origin}    状态: ${stateName(current.state)}    模块: ${S.dim}${truncate(current.name || current.id, 46)}${S.reset}`)
        lines.push('  功能:')
        for (const l of wrapText(desc, 96)) lines.push(`    ${l}`)
      }
      lines.push('', renderFooter('空格 启停 · ↑↓/数字 选择 · Tab 或 a/s/c 过滤 · Esc 返回 · 改动重启后生效'))
      return lines
    }

    const action = await new Promise((resolve) => {
      const draw = () => paint(render())
      const stop = startInput((k) => {
        if (k.type === 'up') sel = (sel + items.length - 1) % Math.max(1, items.length)
        if (k.type === 'down') sel = (sel + 1) % Math.max(1, items.length)
        const d = digitSelect(k, items.length); if (d >= 0) sel = d
        if (k.type === 'tab') { stop(); resolve('filter-next') }
        if (k.type === 'space' && items.length > 0) { stop(); resolve(items[sel]) }
        if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve('exit') }
        if (k.type === 'char') {
          const target = FILTERS.find((f) => f.letter === k.ch)
          if (target && target.key !== filter) { stop(); resolve({ filter: target.key }) }
        }
        draw()
      })
      draw()
    })
    if (action === 'exit') return
    if (action === 'filter-next') {
      const i = FILTERS.findIndex((f) => f.key === filter)
      filter = FILTERS[(i + 1) % FILTERS.length].key
      sel = 0
      continue
    }
    if (action && action.filter) { filter = action.filter; sel = 0; continue }
    if (!action || typeof action !== 'object') continue
    const v = action
    const cache = ctx.config.plugins.disabled
    const entry = cache.find((e) => e.id === v.id)
    const turningOff = v.state === 'on'
    if (turningOff && CORE_ROW_IDS.includes(v.id)) {
      paint([renderHeader('插件管理'), '', `  ${S.red}✗ ${v.id} 是核心骨架行，禁用后服务可能无法启动。`, '', renderFooter('Enter 仍要禁用 · Esc 取消')])
      const sure = await new Promise((resolve) => {
        const stop = startInput((k) => { if (k.type === 'enter') { stop(); resolve(true) } if (k.type === 'esc' || k.type === 'ctrl-c') { stop(); resolve(false) } })
      })
      if (!sure) continue
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
  }
}
