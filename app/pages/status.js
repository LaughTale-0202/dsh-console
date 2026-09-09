/** 状态首页快照与项目路径校验；纯函数。 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDoc } from '../core/yamlfile.js'

export function validateProjectPath(p) {
  if (typeof p !== 'string' || p.trim() === '') return { ok: false, reason: '路径为空' }
  const pkg = join(p, 'package.json')
  if (!existsSync(pkg)) return { ok: false, reason: '找不到 package.json（不是项目根目录）' }
  try {
    const name = JSON.parse(readFileSync(pkg, 'utf8')).name
    if (name === '@deepseek-ai/dsh-root' || existsSync(join(p, 'apps', 'cli'))) return { ok: true, reason: '' }
    return { ok: false, reason: '该目录不是 deepseek-harness 检出' }
  } catch {
    return { ok: false, reason: 'package.json 无法解析' }
  }
}

/** 默认模型段读取路径；schema 研究确认后如需改动只需改此常量。 */
export const DEFAULT_MODEL_NS = 'agent-default-model'

export function statusSnapshot({ config, owners, settingsDoc }) {
  const port = config.service.port
  const running = owners.length > 0
  const model = settingsDoc?.getIn([DEFAULT_MODEL_NS, 'model'])
  const head = config.project.lastBuildHead
  return {
    service: running ? '运行中' : '已停止',
    url: `http://127.0.0.1:${String(port)}`,
    model: typeof model === 'string' ? model : '未配置',
    build: typeof head === 'string' ? head.slice(0, 7) : '未构建',
    preset: config.presets?.intranet?.enabled ? '内网预设' : '公网直连',
  }
}

export function readSettingsDoc(dshHome) {
  return readDoc(join(dshHome, 'settings.yaml'))
}
