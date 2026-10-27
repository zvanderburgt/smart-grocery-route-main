import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const css = readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8')

describe('scanner overlay styles', () => {
  afterEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('hides the html5-qrcode guide overlay everywhere', () => {
    const overlayRule = css.match(/#qr-shaded-region\s*,[\s\S]*?#qr-shaded-region div\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const style = document.createElement('style')
    style.textContent = overlayRule
    document.head.appendChild(style)

    const overlay = document.createElement('div')
    overlay.id = 'qr-shaded-region'
    const guide = document.createElement('div')
    overlay.appendChild(guide)
    document.body.appendChild(overlay)

    expect(getComputedStyle(overlay).display).toBe('none')
    expect(getComputedStyle(guide).display).toBe('none')
  })
})
