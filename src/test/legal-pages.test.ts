import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Google will not approve the OAuth app without a public privacy policy, and the
 * URLs handed to it are built from static files in public/ plus the rewrites in
 * netlify.toml. A rename or a dropped redirect would break the review silently,
 * so pin the pieces this deployment promises rather than the whole document.
 */

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), 'utf8')

const privacy = read('public/privacy.html')
const terms = read('public/terms.html')
const netlifyToml = read('netlify.toml')
const viteConfig = read('vite.config.ts')
const settingsPanel = read('src/components/DiagnosticsPanel.tsx')

describe('legal pages', () => {
  it('exists as a privacy policy and a terms page, served from public/', () => {
    expect(privacy).toMatch(/<title>Privacy Policy/)
    expect(terms).toMatch(/<title>Terms of Service/)
    expect(privacy).toContain('rel="canonical" href="https://breadcrumbapp.netlify.app/privacy"')
    expect(terms).toContain('rel="canonical" href="https://breadcrumbapp.netlify.app/terms"')
  })

  it('carries the disclosure Google requires for the Sheets scope', () => {
    // "Limited Use" is a hard requirement of the API Services User Data Policy;
    // omitting it stalls verification.
    expect(privacy).toContain('Google API Services User Data Policy')
    expect(privacy).toMatch(/Limited Use/)
    expect(privacy).toContain('myaccount.google.com/permissions')
  })

  it('describes every place data actually goes', () => {
    for (const subject of [
      'local storage',
      'Google Sheets',
      'session storage',
      'refresh token',
      'OpenRouter',
      'OpenCode',
      'Netlify',
      'speech recognition',
    ]) {
      expect(privacy).toContain(subject)
    }
  })

  it('gives a reachable contact and a date on both pages', () => {
    expect(privacy).toContain('mailto:zvanderburgt@gmail.com')
    expect(terms).toContain('mailto:zvanderburgt@gmail.com')
    expect(privacy).toMatch(/Last updated \d{1,2} \w+ \d{4}/)
    expect(terms).toMatch(/Last updated \d{1,2} \w+ \d{4}/)
  })

  it('cross-links the two documents so each is one hop from the other', () => {
    expect(privacy).toContain('href="/terms"')
    expect(terms).toContain('href="/privacy"')
  })

  it('has no placeholder text left in it', () => {
    for (const page of [privacy, terms]) {
      expect(page).not.toMatch(/lorem ipsum/i)
      expect(page).not.toMatch(/TODO|FIXME|\[your |example\.com/i)
    }
  })
})

describe('legal page routing', () => {
  it('rewrites /privacy and /terms to the static files', () => {
    // A 200 rewrite keeps the clean URL in the address bar; a 301 would land
    // reviewers on /privacy.html instead.
    for (const [from, to] of [
      ['/privacy', '/privacy.html'],
      ['/terms', '/terms.html'],
    ]) {
      const rule = new RegExp(
        `\\[\\[redirects\\]\\][^[]*?from = "${from}"[^[]*?to = "${to}"[^[]*?status = 200`
      )
      expect(netlifyToml).toMatch(rule)
    }
  })

  it('keeps the service worker from answering those URLs with the app shell', () => {
    expect(viteConfig).toMatch(/navigateFallbackDenylist:\s*\[\/\^\\\/\(privacy\|terms\)/)
  })
})

describe('in-app entry points', () => {
  it('links both documents from the settings sheet', () => {
    expect(settingsPanel).toContain('href="/privacy"')
    expect(settingsPanel).toContain('href="/terms"')
  })
})
