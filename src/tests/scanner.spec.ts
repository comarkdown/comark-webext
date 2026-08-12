import { describe, expect, it } from 'vitest'
import componentsSource from './fixtures/components.md?raw'
import { hasComarkSyntax, isAttributesContent, scan } from '~/contentScripts/comark/scanner'

describe('scan: block components', () => {
  it('finds a simple block component', () => {
    const { blocks } = scan('# Title\n\n::alert{type="info"}\nHello\n::\n')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      name: 'alert',
      openingLine: '::alert{type="info"}',
      closerLineCount: 1,
      source: '::alert{type="info"}\nHello\n::',
    })
  })

  it('keeps nested components inside the top-level region', () => {
    const source = '::outer\ntext\n\n:::inner{variant="compact"}\ninner text\n:::\n\nmore\n::\n'
    const { blocks } = scan(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].name).toBe('outer')
    expect(blocks[0].closerLineCount).toBe(2)
    expect(blocks[0].source).toContain(':::inner')
  })

  it('ignores components inside fenced code blocks', () => {
    const source = '```mdc\n::alert\nnope\n::\n```\n\n::real\nyes\n::\n'
    const { blocks } = scan(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].name).toBe('real')
  })

  it('excludes fenced closer lines from the closer count', () => {
    const source = '::code-group\n```mdc\n::alert\nhi\n::\n```\n::\n'
    const { blocks } = scan(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].closerLineCount).toBe(1)
  })

  it('skips the frontmatter', () => {
    const source = '---\ntitle: X\n---\n\n::alert\nhi\n::\n'
    const { blocks } = scan(source)
    expect(blocks).toHaveLength(1)
  })

  it('closes an unterminated component at the end of the document', () => {
    const { blocks } = scan('::alert\nhi')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].source).toBe('::alert\nhi')
  })
})

describe('scan: inline fragments', () => {
  it('finds inline components', () => {
    const { inline } = scan('Click the :button[Submit]{type="primary"} to continue.\n')
    expect(inline).toEqual([
      { type: 'inline-component', text: ':button[Submit]{type="primary"}' },
    ])
  })

  it('finds a bare inline component', () => {
    const { inline } = scan('An :icon-star here.\n')
    expect(inline).toEqual([{ type: 'inline-component', text: ':icon-star' }])
  })

  it('does not match emoji shortcodes', () => {
    const { inline } = scan('A party :tada: here.\n')
    expect(inline).toEqual([])
  })

  it('finds spans with attributes', () => {
    const { inline } = scan('This is [highlighted]{.mark} text.\n')
    expect(inline).toEqual([{ type: 'span', text: '[highlighted]{.mark}' }])
  })

  it('finds attribute groups after inline elements', () => {
    const { inline } = scan('Some **bold**{.accent #id} text.\n')
    expect(inline).toEqual([{ type: 'attributes', text: '{.accent #id}' }])
  })

  it('finds bindings', () => {
    const { inline } = scan('Hello {{ user.name || Anonymous }}!\n')
    expect(inline).toEqual([{ type: 'binding', text: '{{ user.name || Anonymous }}' }])
  })

  it('ignores prose braces without attribute markers', () => {
    const { inline } = scan('A set {a, b} and a word {maybe} here.\n')
    expect(inline).toEqual([])
  })

  it('ignores fragments inside inline code', () => {
    const { inline } = scan('Use the `:icon-star` syntax.\n')
    expect(inline).toEqual([])
  })

  it('deduplicates repeated fragments', () => {
    const { inline } = scan(':icon-star and :icon-star again.\n')
    expect(inline).toHaveLength(1)
  })
})

describe('isAttributesContent', () => {
  it.each([
    ['.class', true],
    ['#id', true],
    ['key="value"', true],
    ['.a #b c="d"', true],
    ['target="_blank" rel="noopener"', true],
    ['maybe', false],
    ['a, b', false],
    ['', false],
  ])('%s -> %s', (inner, expected) => {
    expect(isAttributesContent(inner)).toBe(expected)
  })
})

describe('hasComarkSyntax', () => {
  it('accepts comark documents', () => {
    expect(hasComarkSyntax(componentsSource)).toBe(true)
  })

  it('rejects plain markdown', () => {
    expect(hasComarkSyntax('# Title\n\nJust **regular** markdown with [a link](https://a.dev).\n')).toBe(false)
  })
})

describe('scan: real fixture', () => {
  it('finds the top-level components of the docs page', () => {
    const { blocks } = scan(componentsSource)
    expect(blocks.length).toBe(9)
    const names = blocks.map(block => block.name)
    expect(names).toContain('callout')
    expect(names).toContain('code-group')
    expect(names).toContain('tip')
    // every region carries exactly one closer: fenced examples are excluded
    expect(blocks.every(block => block.closerLineCount === 1)).toBe(true)
  })
})
