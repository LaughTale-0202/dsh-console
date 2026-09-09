/** 桌面快捷方式（规格 §2 附加能力）。 */
import { join } from 'node:path'
import { runPs } from './port.js'

const psq = (s) => `"${String(s).replace(/"/g, '""')}"`

export function shortcutCommand({ target, link, workDir }) {
  return [
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${psq(link)})`,
    `$s.TargetPath = ${psq(target)}`,
    `$s.WorkingDirectory = ${psq(workDir)}`,
    '$s.Save()',
  ].join('; ')
}

export async function createDesktopShortcut(toolRoot) {
  const desktop = (await runPs("[Environment]::GetFolderPath('Desktop')")).trim()
  const link = join(desktop, 'dsh 控制台.lnk')
  await runPs(shortcutCommand({ target: join(toolRoot, '启动.bat'), link, workDir: toolRoot }))
  return link
}
