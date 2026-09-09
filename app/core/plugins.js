/** 插件管理（规格 §6）：dump 解析、来源分类、overlay 渲染与意图缓存。
 * 已按真实 dump 语义实现：行默认启用、`disabled:true` 才关闭；`name` 为组件模块包名；
 * 系统行对应 monorepo packages 下 group/pkg 两级的包（@deepseek-ai/dsh-*）。 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import YAML from 'yaml'

/** 禁用后可能导致 web 服务无法启动的核心骨架行（启动前给二次确认）。 */
export const CORE_ROW_IDS = [
  'session', 'loader', 'include', 'connection', 'modules',
  'llm', 'agent', 'agent-loop', 'tools', 'settings', 'credentials',
  'webserver', 'web-runtime', 'agent-default-model', 'session-controller',
]

/** 去掉包名里的子路径（@scope/pkg/sub -> @scope/pkg；pkg/sub -> pkg）。 */
export function basePackageName(name) {
  const parts = String(name).split('/')
  return (parts[0].startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)).join('/')
}

export function parseDump(text) {
  const doc = YAML.parseDocument(text)
  if (doc.errors.length > 0) throw new Error(`dump 输出解析失败：${doc.errors[0].message}`)
  const rows = doc.toJS() ?? []
  if (!Array.isArray(rows)) throw new Error('dump 输出应为行数组')
  return rows.filter((r) => r !== null && typeof r === 'object' && typeof r.id === 'string')
}

/** 在 packages 的 group/pkg 两级中定位给定（包名或其子路径所属）包目录；找不到返回 null。 */
export function pkgDir(projectRoot, name) {
  const target = basePackageName(name)
  if (target === '') return null
  const groups = join(projectRoot, 'packages')
  if (!existsSync(groups)) return null
  for (const group of readdirSync(groups, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    const groupDir = join(groups, group.name)
    for (const pkg of readdirSync(groupDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue
      const manifest = join(groupDir, pkg.name, 'package.json')
      if (!existsSync(manifest)) continue
      try {
        if (JSON.parse(readFileSync(manifest, 'utf8')).name === target) return join(groupDir, pkg.name)
      } catch { /* 非法 manifest 跳过 */ }
    }
  }
  return null
}

/** 系统=monorepo 内包或 @deepseek-ai/* 官方包；其余自定义。 */
export function classifyRow(row, projectRoot) {
  const name = typeof row.name === 'string' ? row.name : ''
  if (name === '') return 'custom'
  if (pkgDir(projectRoot, name) !== null) return 'system'
  return basePackageName(name).startsWith('@deepseek-ai/') ? 'system' : 'custom'
}

export function describeRow(row, projectRoot) {
  const dir = pkgDir(projectRoot, typeof row.name === 'string' ? row.name : '')
  if (dir === null) return null
  try {
    const d = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).description
    return typeof d === 'string' && d !== '' ? d : null
  } catch { return null }
}

/** overlay 渲染：mode 'off' -> disabled:true；mode 'on' -> disabled:false（用于强制启用官方关闭行）。 */
export function renderOverlay(entries) {
  return YAML.stringify(entries.map((e) => ({ id: e.id, disabled: e.mode !== 'on' })))
}

export function writeOverlay(file, entries) {
  mkdirSync(dirname(file), { recursive: true })
  const effective = entries.filter((e) => e.mode === 'off' || e.mode === 'on')
  writeFileSync(file, effective.length === 0 ? '[]\n' : renderOverlay(effective), 'utf8')
}

export function upsertCacheEntry(cache, entry) {
  const next = cache.filter((e) => e.id !== entry.id)
  next.push(entry)
  return next
}

export function dropCacheEntry(cache, id) {
  return cache.filter((e) => e.id !== id)
}

/** 显示行：把意图缓存叠加到 dump 观察态，得出 启用/官方默认关/我停用 三分态。 */
export function enrichRows(rows, cache, projectRoot) {
  const byId = new Map(cache.map((e) => [e.id, e]))
  return rows.map((row) => {
    const entry = byId.get(row.id)
    const rowDisabled = row.disabled === true
    let state = 'on'
    if (rowDisabled) state = entry?.mode === 'off' ? 'off-user' : 'off-official'
    return {
      id: row.id,
      label: row.id,
      name: entry?.name ?? row.name ?? row.id,
      origin: entry?.origin ?? classifyRow(row, projectRoot),
      description: describeRow(row, projectRoot) ?? '',
      state,
      disabled: rowDisabled,
    }
  })
}
