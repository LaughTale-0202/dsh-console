/** 长任务流水线：安装/构建 + in-flight 标记与日志落盘（规格 §8）。 */
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitHeadOf, planGates, runPnpm } from './lifecycle.js'

export const TOOL_ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const LOGS_DIR = join(TOOL_ROOT, 'data', 'logs')
export const IN_FLIGHT = join(TOOL_ROOT, 'data', 'in-flight.json')

export function logFileOf(label) {
  mkdirSync(LOGS_DIR, { recursive: true })
  return join(LOGS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.log`)
}

export function markInFlight(label) {
  mkdirSync(join(TOOL_ROOT, 'data'), { recursive: true })
  writeFileSync(IN_FLIGHT, JSON.stringify({ label, at: new Date().toISOString() }))
}

export function clearInFlight() {
  try { rmSync(IN_FLIGHT) } catch { /* 无标记 */ }
}

/**
 * 依据 config.project 历史执行 pnpm install / build（按需）。
 * @param config 已装载的 config（会被就地更新 lastInstallAt/lastBuildHead）
 * @param opts.save 每次变更后持久化（调用方应写 config.json）
 * @param opts.onLine 实时输出回调
 * @param opts.installEnv 安装期环境变量（内网镜像，B5 注入）
 */
export async function runInstallBuild(config, { save, onLine, installEnv = {} } = {}) {
  if (typeof save !== 'function') throw new Error('runInstallBuild 需要 opts.save 以持久化进度')
  // npm 全局模式没有本地检出：无需安装/构建。
  if (config.launch?.mode === 'npm') return { install: false, build: false }
  const root = config.project.path
  const gates = planGates({
    nodeModulesExists: existsSync(join(root, 'node_modules')),
    lockMtime: statSync(join(root, 'pnpm-lock.yaml')).mtimeMs,
    pkgMtime: statSync(join(root, 'package.json')).mtimeMs,
    lastInstallAt: config.project.lastInstallAt,
    gitHead: await gitHeadOf(root),
    lastBuildHead: config.project.lastBuildHead,
  })
  if (gates.install) {
    markInFlight('install')
    try {
      const r = await runPnpm({ projectRoot: root, args: ['install'], env: installEnv, onLine, logFile: logFileOf('install') })
      if (r.code !== 0) throw new Error(`pnpm install 失败（码 ${String(r.code)}）。最近输出：\n${r.tail.slice(-10).join('\n')}`)
      config.project.lastInstallAt = Date.now()
      save()
    } finally { clearInFlight() }
  }
  if (gates.build) {
    markInFlight('build')
    try {
      const r = await runPnpm({ projectRoot: root, args: ['run', 'build'], env: installEnv, onLine, logFile: logFileOf('build') })
      if (r.code !== 0) throw new Error(`pnpm run build 失败（码 ${String(r.code)}）。最近输出：\n${r.tail.slice(-10).join('\n')}`)
      config.project.lastBuildHead = await gitHeadOf(root)
      save()
    } finally { clearInFlight() }
  }
  return gates
}
