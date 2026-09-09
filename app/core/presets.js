/** 内网预设（规格 §9）：启动 env、安装镜像 env、代理同步、根证书导出。
 * 环境变量名已核对真实 dsh：遥测开关 DSH_TELEMETRY_MODE/DSH_TELEMETRY_DISABLED、
 * CA 证书 NODE_EXTRA_CA_CERTS、代理 HTTP(S)_PROXY/NO_PROXY。 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { withFileLock } from './lock.js'

export function buildLaunchEnv(preset) {
  const env = {}
  if (preset?.enabled !== true) return env
  if (preset.telemetryOff !== false) {
    env.DSH_TELEMETRY_MODE = 'DISABLED'
    env.DSH_TELEMETRY_DISABLED = '1'
  }
  if (preset.nodeExtraCaCerts) env.NODE_EXTRA_CA_CERTS = preset.nodeExtraCaCerts
  const proxy = preset.proxy ?? {}
  if (proxy.https) {
    env.HTTPS_PROXY = proxy.https
    env.HTTP_PROXY = proxy.http ?? proxy.https
  } else if (proxy.http) {
    env.HTTP_PROXY = proxy.http
  }
  if (proxy.noProxy) env.NO_PROXY = proxy.noProxy
  return env
}

export function buildInstallEnv(preset) {
  const env = buildLaunchEnv(preset)
  const mirrors = preset?.mirrors ?? {}
  if (preset?.enabled === true && mirrors.npmRegistry) env.NPM_CONFIG_REGISTRY = mirrors.npmRegistry
  if (preset?.enabled === true && mirrors.corepackRegistry) env.COREPACK_NPM_REGISTRY = mirrors.corepackRegistry
  return env
}

export function upsertDotenv(file, entries) {
  return withFileLock(file, () => {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
    const names = new Set(Object.keys(entries))
    const kept = text.split(/\r?\n/).filter((l) => {
      const t = l.trim()
      return t !== '' && ![...names].some((n) => t.startsWith(`${n}=`))
    })
    const next = [...kept, ...Object.entries(entries).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n'
    const tmp = `${file}.${Math.random().toString(36).slice(2)}.tmp`
    writeFileSync(tmp, next, 'utf8')
    renameSync(tmp, file)
  })
}

export function syncProxyToDshEnv(dshHome, preset) {
  const proxy = preset?.proxy ?? {}
  const entries = {}
  if (proxy.http) entries.HTTP_PROXY = proxy.http
  if (proxy.https) entries.HTTPS_PROXY = proxy.https
  if (proxy.noProxy) entries.NO_PROXY = proxy.noProxy
  return Object.keys(entries).length > 0 ? upsertDotenv(join(dshHome, '.env'), entries) : Promise.resolve()
}

export function exportRootCertsCommand(pemPath) {
  return [
    '$o = foreach ($x in (Get-ChildItem Cert:\\LocalMachine\\Root)) {',
    '  "-----BEGIN CERTIFICATE-----"',
    '  [Convert]::ToBase64String($x.RawData, [Base64FormattingOptions]::InsertLineBreaks)',
    '  "-----END CERTIFICATE-----"',
    '}',
    `Set-Content -LiteralPath "${pemPath.replace(/"/g, '""')}" -Value ($o -join "\`n")`,
  ].join(' ')
}
