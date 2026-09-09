/** 原始模式键盘输入：字节流 → 语义按键。startInput 仅可在真 TTY 下调用。 */
export function decodeKey(buf) {
  if (buf.length === 3 && buf[0] === 0x1b && buf[1] === 0x5b) {
    if (buf[2] === 0x41) return { type: 'up' }
    if (buf[2] === 0x42) return { type: 'down' }
    if (buf[2] === 0x43) return { type: 'right' }
    if (buf[2] === 0x44) return { type: 'left' }
  }
  if (buf.length === 1) {
    const b = buf[0]
    if (b === 0x1b) return { type: 'esc' }
    if (b === 0x0d || b === 0x0a) return { type: 'enter' }
    if (b === 0x20) return { type: 'space' }
    if (b === 0x09) return { type: 'tab' }
    if (b === 0x7f || b === 0x08) return { type: 'backspace' }
    if (b === 0x03) return { type: 'ctrl-c' }
    if (b === 0x11) return { type: 'ctrl-q' }
  }
  return { type: 'char', ch: buf.toString('utf8') }
}

export function startInput(onKey) {
  if (!process.stdin.isTTY) throw new Error('需要交互式终端（TTY）')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  const onData = (buf) => { onKey(decodeKey(buf)) }
  process.stdin.on('data', onData)
  return () => {
    process.stdin.off('data', onData)
    process.stdin.pause()
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
  }
}

/** 单行文本输入；mask=true 时字符显示为 ●；Esc 取消返回 null。 */
export function textInput({ prompt, mask = false }) {
  return new Promise((resolve) => {
    const chars = []
    let closed = false
    const stop = startInput((key) => {
      if (closed) return
      if (key.type === 'enter') {
        closed = true
        stop()
        resolve(chars.join(''))
      } else if (key.type === 'esc' || key.type === 'ctrl-c') {
        closed = true
        stop()
        resolve(null)
      } else if (key.type === 'backspace') {
        chars.pop()
      } else if (key.type === 'char') {
        chars.push(key.ch)
      }
      const shown = mask ? '●'.repeat(chars.length) : chars.join('')
      process.stdout.write(`\r\x1b[K  ${prompt} ${shown}`)
    })
    process.stdout.write(`\r\x1b[K  ${prompt} `)
  })
}
