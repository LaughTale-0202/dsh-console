/** 工具自身配置：默认值来自规格 §4；原子写；版本迁移按 version 判断。 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

export const CONFIG_VERSION = 1

export const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  project: { path: null, lastInstallAt: 0, lastBuildHead: null, lastStartAt: 0 },
  service: { port: 3080, autoOpenBrowser: true },
  model: { provider: null, baseUrl: null, modelId: null, apiKeySet: false, apiKeyRef: null },
  presets: {
    intranet: {
      enabled: false,
      telemetryOff: true,
      nodeExtraCaCerts: null,
      proxy: { http: null, https: null, noProxy: null, syncToDshEnv: false },
      mirrors: { npmRegistry: null, corepackRegistry: null, nodeDistUrl: null },
    },
  },
  plugins: { disabled: [] },
  ui: { language: 'zh-CN' },
  wizard: { completedAt: null },
}

export function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || typeof over !== 'object' || base === null || over === null) {
    return over === undefined ? base : over
  }
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(base[k], v)
  return out
}

export function loadConfig(file) {
  if (!existsSync(file)) return null
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  if (raw.version !== CONFIG_VERSION) {
    throw new Error(`config.json 版本 ${String(raw.version)} 不被支持（当前 ${CONFIG_VERSION}）；请删除后重新生成`)
  }
  return deepMerge(DEFAULT_CONFIG, raw)
}

export function saveConfig(file, config) {
  const tmp = `${file}.${Math.random().toString(36).slice(2)}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}
