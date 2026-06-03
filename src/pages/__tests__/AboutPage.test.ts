import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const aboutPagePath = resolve('src/pages/AboutPage.vue')

describe('AboutPage author information', () => {
  it('shows the author profile and clickable GitHub link', () => {
    const source = readFileSync(aboutPagePath, 'utf8')

    expect(source).toContain('作者信息')
    expect(source).toContain('Samuel游')
    expect(source).toContain('malovoz')
    expect(source).toContain('https://github.com/SamuelYooo/sam-image-app')
    expect(source).toContain('求 star 哦')
    expect(source).toContain('openExternalLink(authorGithubUrl)')
  })
})
