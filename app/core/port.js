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

export function isNodeFamily(name) {
  const n = (name ?? '').toLowerCase().replace(/\.exe$/, '')
  return n === 'node' || n === 'pnpm' || n === 'npm' || n === 'corepack'
}

export function runPs(command) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', command], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (c) => { out += c.toString('utf8') })
    p.stderr.on('data', (c) => { err += c.toString('utf8') })
    p.on('error', reject)
    p.on('exit', (code) => { code === 0 ? resolve(out) : reject(new Error(`PowerShell 失败(${code})：${err.slice(0, 300)}`)) })
  })
}

export async function findPortOwners(port) {
  const out = await runPs(`$ErrorActionPreference = 'SilentlyContinue'; @(Get-NetTCPConnection -LocalPort ${port} -State Listen).ForEach({ $_.OwningProcess })`)
  const owners = []
  for (const pid of parsePids(out)) {
    let name = ''
    try {
      name = (await runPs(`Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName`)).trim()
    } catch { name = '' }
    owners.push({ pid, name: name || '未知' })
  }
  return owners
}

export async function killTree(pid) {
  try {
    const out = await runPs(`taskkill /PID ${pid} /T /F`)
    return { ok: true, detail: out.trim() }
  } catch (error) {
    return { ok: false, detail: String(error.message) }
  }
}
