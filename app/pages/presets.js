/** 内网预设页（规格 §9）：开关与字段编辑 + 一键导出证书/同步 .env。 */
import { S } from '../ui/ansi.js'
import { textInput } from '../ui/input.js'
import { runPs } from '../core/port.js'
import { exportRootCertsCommand, syncProxyToDshEnv } from '../core/presets.js'
import { listPick } from './shared.js'
import { join } from 'node:path'

const FIELDS = [
  { key: 'http', label: 'HTTP 代理', group: 'proxy' },
  { key: 'https', label: 'HTTPS 代理', group: 'proxy' },
  { key: 'noProxy', label: 'NO_PROXY', group: 'proxy' },
  { key: 'npmRegistry', label: 'npm 镜像源', group: 'mirrors' },
  { key: 'corepackRegistry', label: 'corepack 镜像源', group: 'mirrors' },
  { key: 'nodeDistUrl', label: 'Node 安装包直链', group: 'mirrors' },
]

function fieldItems(p) {
  const head = [
    { label: `启用内网预设  ${p.enabled ? '开' : '关'}`, hint: '总开关' },
    { label: `关闭遥测上报  ${p.telemetryOff ? '开' : '关'}`, hint: 'DSH_TELEMETRY_*' },
    { label: `CA 证书  ${p.nodeExtraCaCerts ?? '未设置'}`, hint: 'NODE_EXTRA_CA_CERTS' },
    { label: '从 Windows 证书库导出根证书', hint: '生成 PEM 并回填路径' },
  ]
  const fields = FIELDS.map((f) => ({ label: `${f.label}  ${p[f.group][f.key] ?? '未设置'}`, hint: '' }))
  const tail = [
    { label: '同步代理到 ~/.dsh/.env', hint: '手动启动也生效；项目 .env 放代理会被官方拒绝' },
    { label: '返回', hint: '' },
  ]
  return [...head, ...fields, ...tail]
}

export async function presetsPage(ctx) {
  const p = ctx.config.presets.intranet
  for (;;) {
    const items = fieldItems(p)
    const topLines = [
      `  ${S.dim}说明：关闭遥测并注入 CA/代理后启动服务；镜像源仅安装/构建时生效。${S.reset}`,
      '',
    ]
    const pick = await listPick({ title: '启动预设（内网）', topLines, items })
    if (pick === null || pick === items.length - 1) return
    if (pick === 0) { p.enabled = !p.enabled; ctx.save(); continue }
    if (pick === 1) { p.telemetryOff = !p.telemetryOff; ctx.save(); continue }
    if (pick === 2) {
      const v = await textInput({ prompt: 'CA PEM 文件路径' })
      if (v !== null) { p.nodeExtraCaCerts = v.trim() === '' ? null : v.trim(); ctx.save() }
      continue
    }
    if (pick === 3) {
      const target = join(ctx.toolRoot, 'data', 'root-ca.pem')
      try {
        await runPs(exportRootCertsCommand(target))
        p.nodeExtraCaCerts = target
        ctx.save()
        process.stdout.write(`\r\n  ${S.green}✓ 已导出并回填：${target}${S.reset}\r\n`)
      } catch (error) {
        process.stdout.write(`\r\n  ${S.red}✗ ${String(error.message).split('\n')[0]}${S.reset}\r\n`)
      }
      continue
    }
    if (pick === 4 + FIELDS.length) {
      await syncProxyToDshEnv(ctx.dshHome, p)
      p.proxy.syncToDshEnv = true
      ctx.save()
      process.stdout.write(`\r\n  ${S.green}✓ 已写入 ${join(ctx.dshHome, '.env')}${S.reset}\r\n`)
      continue
    }
    const field = FIELDS[pick - 4]
    if (field) {
      const v = await textInput({ prompt: field.label })
      if (v !== null) {
        p[field.group][field.key] = v.trim() === '' ? null : v.trim()
        ctx.save()
      }
    }
  }
}
