/** 默认模型与凭据（规格 §7）：OpenAI 兼容发现 + 三写入点，全部经写锁。
 * 已按真实 deepseek-harness schema 核对：settings.yaml 的 agent-default-model 与
 * llm-pi-ai.providers.<id>、.credentials.yaml 的 refs（version:1）均为实际读写路径。 */
import { join } from 'node:path'
import { readDoc, patchYaml } from './yamlfile.js'

export const PROVIDER_ID_RE = /^[a-z][a-z0-9-]*$/

export async function discoverModels(baseUrl, apiKey, fetchImpl) {
  const res = await (fetchImpl ?? fetch)(`${baseUrl.replace(/\/+$/, '')}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`模型列表请求失败：HTTP ${String(res.status)}`)
  const body = await res.json()
  const data = Array.isArray(body?.data) ? body.data : []
  return data.map((m) => m?.id).filter((id) => typeof id === 'string')
}

export async function configureProvider({ dshHome, providerId, baseUrl, apiKeyRef, apiKey, modelId, modelName }) {
  if (!PROVIDER_ID_RE.test(providerId)) throw new Error(`提供方路由名必须为小写连字符标识符：${providerId}`)
  await patchYaml(join(dshHome, '.credentials.yaml'), (doc) => {
    if (doc.get('version') === undefined) doc.set('version', 1)
    doc.setIn(['refs', apiKeyRef], apiKey)
  })
  await patchYaml(join(dshHome, 'settings.yaml'), (doc) => {
    doc.setIn(['llm-pi-ai', 'providers', providerId, 'api'], 'openai-completions')
    doc.setIn(['llm-pi-ai', 'providers', providerId, 'baseURL'], baseUrl)
    doc.setIn(['llm-pi-ai', 'providers', providerId, 'apiKeyEnv'], apiKeyRef)
    const models = [{ id: modelId }]
    if (modelName) models[0].name = modelName
    doc.setIn(['llm-pi-ai', 'providers', providerId, 'models'], models)
    doc.setIn(['agent-default-model', 'provider'], providerId)
    doc.setIn(['agent-default-model', 'model'], modelId)
  })
}

export function currentDefault(dshHome) {
  const v = readDoc(join(dshHome, 'settings.yaml'))?.getIn(['agent-default-model'])
  return v && typeof v.get === 'function' && typeof v.get('provider') === 'string' && typeof v.get('model') === 'string'
    ? { provider: v.get('provider'), model: v.get('model') }
    : null
}

export function listProviders(dshHome) {
  const providers = readDoc(join(dshHome, 'settings.yaml'))?.getIn(['llm-pi-ai', 'providers'])
  if (providers === undefined || !Array.isArray(providers.items)) return []
  return providers.items.map((pair) => String(pair.key)).filter((id) => id !== 'comment')
}

export async function setDeepSeekKey({ dshHome, apiKey }) {
  await patchYaml(join(dshHome, '.credentials.yaml'), (doc) => {
    if (doc.get('version') === undefined) doc.set('version', 1)
    doc.setIn(['refs', 'DEEPSEEK_API_KEY'], apiKey)
  })
}

export async function removeProvider({ dshHome, providerId, resetDefault }) {
  await patchYaml(join(dshHome, 'settings.yaml'), (doc) => {
    doc.deleteIn(['llm-pi-ai', 'providers', providerId])
    if (resetDefault) doc.deleteIn(['agent-default-model'])
  })
}
