/** 模型与凭据页（规格 §7）：用户只给端点+Key，其余自动。 */
import { S } from '../ui/ansi.js'
import { textInput } from '../ui/input.js'
import { renderFooter, renderHeader } from '../ui/components.js'
import { paint } from '../ui/screen.js'
import { configureProvider, currentDefault, discoverModels, listProviders, removeProvider, setDeepSeekKey } from '../core/model.js'
import { openPath } from '../core/native.js'
import { choose, confirmOnce, listPick } from './shared.js'
import { join } from 'node:path'

/** 追加一个自定义 OpenAI 兼容提供方并把默认模型指向它。 */
export async function flowConfigureProvider(ctx) {
  const header = '模型与凭据 · 自定义提供方'
  paint([renderHeader(header), '', '  提供端点与 API Key，其余自动完成。', ''])
  const baseUrl = await textInput({ prompt: '端点 URL（OpenAI 兼容，如 https://…/v1）' })
  if (baseUrl === null) return
  const apiKey = await textInput({ prompt: 'API Key', mask: true })
  if (apiKey === null) return
  let modelId = null
  let modelName = undefined
  try {
    paint([renderHeader(header), '', `  ${S.cyan}⠹ 正在从端点拉取模型列表…${S.reset}`])
    const ids = await discoverModels(baseUrl.trim(), apiKey)
    if (ids.length > 0) {
      const pick = await choose(ids.map((id) => ({ label: id })), { title: '选择默认模型' })
      if (pick !== null) modelId = ids[pick]
    }
  } catch {
    process.stdout.write(`\r\n  ${S.yellow}· 端点不支持模型列表，请手动输入模型 id${S.reset}\r\n`)
  }
  if (modelId === null) {
    const manual = await textInput({ prompt: '模型 id（如 glm-4.6）' })
    if (manual === null) return
    modelId = manual.trim()
    modelName = modelId
  }
  const providerId = providerIdForUrl(baseUrl.trim())
  const apiKeyRef = refForProvider(providerId)
  await configureProvider({
    dshHome: ctx.dshHome, providerId, baseUrl: baseUrl.trim(),
    apiKeyRef, apiKey: apiKey.trim(), modelId, modelName,
  })
  ctx.config.model = { provider: providerId, baseUrl: baseUrl.trim(), modelId, apiKeySet: true, apiKeyRef }
  ctx.save()
  await confirmOnce({
    title: '模型与凭据',
    lines: [`  ${S.green}✓${S.reset} 已写入：路由 ${providerId} · 默认模型 ${modelId}`, `  ${S.dim}settings.yaml 与 .credentials.yaml 已更新，运行中即时生效${S.reset}`],
    hint: 'Enter 返回',
  })
}

/** 由端点 URL 推断稳定的小写路由名（无法推断时回退 glm）。 */
export function providerIdForUrl(url) {
  const m = /^[a-z0-9]+:\/\/([^/:]+)/.exec(String(url))
  if (m) {
    const host = m[1].toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
    if (/^[a-z][a-z0-9-]*$/.test(host) && host !== 'openai') return host
  }
  return 'glm'
}

export function refForProvider(providerId) {
  return `${providerId.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_API_KEY`
}

export async function modelPage(ctx) {
  for (;;) {
    const def = currentDefault(ctx.dshHome)
    const providers = listProviders(ctx.dshHome)
    const current = def ? `${S.green}${def.provider} / ${def.model}${S.reset}` : `${S.yellow}未设置${S.reset}`
    const items = [
      { label: '配置自定义提供方', hint: 'GLM / OpenAI 兼容网关（端点 + Key）' },
      { label: '配置 DeepSeek 官方 Key', hint: '只需 API Key' },
      { label: '清除自定义提供方', hint: '删除路由与默认模型' },
      { label: '打开 settings.yaml', hint: join(ctx.dshHome, 'settings.yaml') },
      { label: '打开 .credentials.yaml', hint: join(ctx.dshHome, '.credentials.yaml') },
      { label: '返回', hint: '' },
    ]
    const topLines = [
      `  ${S.dim}当前默认：${S.reset}${current}`,
      `  ${S.dim}已配置提供方：${S.reset}${providers.length ? providers.join('、') : '（无）'}`,
      '',
    ]
    const pick = await listPick({ title: '模型与凭据', topLines, items })
    if (pick === null || pick === 5) return
    if (pick === 0) await flowConfigureProvider(ctx)
    if (pick === 1) {
      const key = await textInput({ prompt: 'DEEPSEEK_API_KEY', mask: true })
      if (key) { await setDeepSeekKey({ dshHome: ctx.dshHome, apiKey: key.trim() }); ctx.save() }
    }
    if (pick === 2) {
      const mine = ctx.config.model.provider ?? null
      if (mine) {
        const reset = def?.provider === mine
        await removeProvider({ dshHome: ctx.dshHome, providerId: mine, resetDefault: reset })
      }
      ctx.config.model = { provider: null, baseUrl: null, modelId: null, apiKeySet: false, apiKeyRef: null }
      ctx.save()
    }
    if (pick === 3) openPath(join(ctx.dshHome, 'settings.yaml'))
    if (pick === 4) openPath(join(ctx.dshHome, '.credentials.yaml'))
  }
}
