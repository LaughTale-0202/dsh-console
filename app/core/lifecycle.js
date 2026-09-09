/** 启动流水线：闸门判定（纯）+ 子进程执行（corepack pnpm / git / dsh web）。 */
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { findPortOwners, killTree } from './port.js'

/** 服务启动成功时从 stdout 解析的 URL 行：`dsh web: http://…/?token=…`。
 * 仅匹配 http:// 开头，避免误吞随后的 “opening the default browser” 提示行。 */
export const URL_LINE = /^dsh web:\s+(http\S+)/

export function nodeVersionOk(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v ?? '')
  if (!m) return false
  const maj = Number(m[1])
  const min = Number(m[2])
  return (maj === 22 && min >= 19) || maj >= 24
}

export function planGates({ nodeModulesExists, lockMtime, pkgMtime, lastInstallAt, gitHead, lastBuildHead }) {
  const stale = Math.max(lockMtime ?? 0, pkgMtime ?? 0) > (lastInstallAt ?? 0)
  return {
    install: !nodeModulesExists || stale,
    build: lastBuildHead === null || lastBuildHead === undefined || (gitHead !== null && gitHead !== lastBuildHead),
  }
}

/** dsh 启动命令组装。要点：`--patch` 属启动器级选项，必须排在应用级（--port/--no-open）之前，
 * 因为启动器在遇到第一个非自身选项后即停止解析后续 `--patch`。 */
export function buildDshCommand({ port = 3080, autoOpenBrowser = true, patches = [] }) {
  const args = ['pnpm', 'dsh', 'web']
  for (const p of patches) args.push('--patch', p)
  if (port !== 3080) args.push('--port', String(port))
  if (!autoOpenBrowser) args.push('--no-open')
  return args
}

export function childEnv(extra = {}) {
  return { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', ...extra }
}

/** 逐行喂入器：缓冲跨 chunk 的半行，仅按 \n 切割；end 时冲刷残余。 */
export function makeLineFeeder(onLine) {
  let pending = ''
  return {
    feed(chunk) {
      pending += chunk.toString('utf8')
      let idx
      while ((idx = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, idx).replace(/\r$/, '')
        pending = pending.slice(idx + 1)
        if (line !== '') onLine(line)
      }
    },
    end() {
      const rest = pending.trimEnd()
      if (rest !== '') onLine(rest)
      pending = ''
    },
  }
}

/** 通用子进程执行：tail 保留最近 maxTail 行（0=不限，dump 场景用），实时回调 onLine；
 * 传 logFile 时完整输出追加落盘（规格 §8 长任务日志，目录由调用方创建）。 */
export function runCommand({ cmd, args, cwd, env, onLine, maxTail = 200, logFile }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const tail = []
    const feeder = makeLineFeeder((line) => {
      tail.push(line)
      if (maxTail > 0 && tail.length > maxTail) tail.shift()
      onLine?.(line)
      if (logFile !== undefined) { try { appendFileSync(logFile, line + '\n', 'utf8') } catch { /* 日志失败不阻塞主流程 */ } }
    })
    child.stdout.on('data', (c) => feeder.feed(c))
    child.stderr.on('data', (c) => feeder.feed(c))
    child.on('error', (error) => resolve({ code: -1, tail: [...tail, String(error.message)] }))
    child.on('exit', (code) => { feeder.end(); resolve({ code: code ?? -1, tail }) })
  })
}

export function gitHeadOf(root) {
  return runCommand({ cmd: 'git', args: ['-C', root, 'rev-parse', 'HEAD'], cwd: root }).then((r) =>
    r.code === 0 ? r.tail.at(-1)?.trim() ?? null : null)
}

/** corepack 是 .cmd：经 cmd.exe 执行；含空格的参数整体加引号。 */
function corepackArgs(args) {
  return ['/c', 'corepack', ...args.map((a) => (a.includes(' ') ? `"${a}"` : a))]
}

export function runPnpm({ projectRoot, args, env, onLine, maxTail, logFile }) {
  return runCommand({ cmd: 'cmd.exe', args: corepackArgs(['pnpm', ...args]), cwd: projectRoot, env: childEnv(env), onLine, maxTail, logFile })
}

export function startService({ projectRoot, port, autoOpenBrowser, patches, env, onLine, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const args = corepackArgs(buildDshCommand({ port, autoOpenBrowser, patches }))
    const child = spawn('cmd.exe', args, { cwd: projectRoot, env: childEnv(env), stdio: ['ignore', 'pipe', 'pipe'] })
    let settled = false
    let url = null
    const tail = []
    const onLineOut = (line) => {
      tail.push(line)
      if (tail.length > 200) tail.shift()
      onLine?.(line)
      const m = URL_LINE.exec(line)
      if (m && !url) {
        url = m[1]
        settle(null, { child, url, tail })
      }
    }
    const feeder = makeLineFeeder(onLineOut)
    const hOut = (c) => feeder.feed(c)
    const hErr = (c) => feeder.feed(c)
    const detach = () => { child.stdout.off('data', hOut); child.stderr.off('data', hErr) }
    const settle = (err, val) => {
      if (settled) return
      settled = true
      detach()
      clearTimeout(timer)
      err ? reject(err) : resolve(val)
    }
    child.stdout.on('data', hOut)
    child.stderr.on('data', hErr)
    child.on('exit', (code) => {
      settle(new Error(`服务进程提前退出（码 ${String(code)}）。最近输出：\n${tail.slice(-10).join('\n')}`))
    })
    const timer = setTimeout(() => {
      child.kill()
      settle(new Error(`等待 dsh web: URL 行超时（${Math.round(timeoutMs / 1000)} 秒）`))
    }, timeoutMs)
    timer.unref()
  })
}

export async function stopPort(port) {
  const owners = await findPortOwners(port)
  const results = []
  for (const { pid } of owners) results.push(await killTree(pid))
  return { owners, results }
}
