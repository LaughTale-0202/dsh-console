/** 系统原生交互：文件夹对话框与资源管理器打开。 */
import { spawn } from 'node:child_process'
import { runPs } from './port.js'

export function pickFolder() {
  return runPs([
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }",
  ].join('; '), { sta: true }).then((out) => {
    const p = out.trim()
    return p === '' ? null : p
  })
}

export function openPath(target) {
  const child = spawn('cmd.exe', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' })
  child.unref()
}
