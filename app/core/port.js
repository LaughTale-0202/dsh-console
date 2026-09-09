/** 端口探测与进程树终止；PS 子进程仅在此封装。 */
import { spawn } from 'node:child_process'

export function parsePids(stdout) {
  const seen = new Set()
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim()
    if (/^\d+$/.test(t)) seen.add(Number(t))
  }
  return [...seen]
}

/** 解析单次探测输出：每行 `PID<TAB>name`。 */
export function parseOwners(stdout) {
  const owners = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^(\d+)\t(.*)$/.exec(line.trim())
    if (!m) continue
    owners.push({ pid: Number(m[1]), name: m[2] || '未知' })
  }
  return owners
}

export function isNodeFamily(name) {
  const n = (name ?? '').toLowerCase().replace(/\.exe$/, '')
  return n === 'node' || n === 'pnpm' || n === 'npm' || n === 'corepack'
}

export function runPs(command, { sta = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', ...(sta ? ['-STA'] : []), '-Command', command], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (c) => { out += c.toString('utf8') })
    p.stderr.on('data', (c) => { err += c.toString('utf8') })
    p.on('error', reject)
    p.on('exit', (code) => { code === 0 ? resolve(out) : reject(new Error(`PowerShell 失败(${code})：${err.slice(0, 300)}`)) })
  })
}

export async function findPortOwners(port) {
  // 单次 PowerShell 探测：一次拿到 占用进程 PID 与进程名，避免对每个 PID 再起进程。
  // 任何失败都返回空（视为无占用），绝不外抛——否则主菜单/启动的前台探测可能被未处理拒绝弄崩。
  try {
    const cmd =
      `$ErrorActionPreference = 'SilentlyContinue'; ` +
      `Get-NetTCPConnection -LocalPort ${port} -State Listen | ForEach-Object { ` +
      `$p = $_.OwningProcess; $n = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName; "$p\`t$n" }`
    const out = await runPs(cmd)
    return parseOwners(out)
  } catch {
    return []
  }
}

export async function killTree(pid) {
  try {
    const out = await runPs(`taskkill /PID ${pid} /T /F`)
    return { ok: true, detail: out.trim() }
  } catch (error) {
    return { ok: false, detail: String(error.message) }
  }
}
