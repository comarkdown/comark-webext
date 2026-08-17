import { describe, expect, it } from 'vitest'
import { github } from 'rangi/themes'
import { gitlab, themeForHost } from '~/contentScripts/comark/theme'

describe('themeForHost', () => {
  it('uses the GitLab palette on gitlab.com', () => {
    expect(themeForHost('gitlab.com')).toBe(gitlab)
  })

  it('uses the GitHub palette everywhere else', () => {
    expect(themeForHost('github.com')).toBe(github)
    expect(themeForHost('localhost')).toBe(github)
  })

  it('pairs a light and a dark GitLab theme', () => {
    expect(gitlab.light.scheme).toBe('light')
    expect(gitlab.dark.scheme).toBe('dark')
    // every light token has a dark counterpart, so --shiki-dark always exists
    expect(Object.keys(gitlab.dark.tokens).sort()).toEqual(Object.keys(gitlab.light.tokens).sort())
  })
})
