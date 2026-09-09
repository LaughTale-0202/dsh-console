import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shortcutCommand } from './shortcut.js'

test('shortcutCommand 含 CreateShortcut 且正确转义引号', () => {
  const cmd = shortcutCommand({ target: 'C:\\a b\\启动.bat', link: 'C:\\Users\\x\\Desktop\\dsh 控制台.lnk', workDir: 'C:\\a b' })
  assert.ok(cmd.includes('CreateShortcut'))
  assert.ok(cmd.includes('"C:\\a b\\启动.bat"'))
  assert.ok(cmd.includes('WorkingDirectory'))
})
