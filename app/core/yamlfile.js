/** YAML 文档读写：patchYaml 在写锁下做叶子级编辑（保注释/顺序），原子写回。 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import YAML from 'yaml'
import { withFileLock } from './lock.js'

export function readDoc(file) {
  if (!existsSync(file)) return undefined
  return YAML.parseDocument(readFileSync(file, 'utf8'))
}

export function patchYaml(file, edit) {
  return withFileLock(file, async () => {
    const doc = existsSync(file) ? YAML.parseDocument(readFileSync(file, 'utf8')) : new YAML.Document()
    await edit(doc)
    const tmp = `${file}.${Math.random().toString(36).slice(2)}.tmp`
    writeFileSync(tmp, String(doc), 'utf8')
    renameSync(tmp, file)
  })
}
