import { beforeEach, describe, expect, it } from 'vitest'
import componentsHtml from './fixtures/components.html?raw'
import componentsSource from './fixtures/components.md?raw'
import landingHtml from './fixtures/landing.html?raw'
import landingSource from './fixtures/landing.md?raw'
import { PROCESSED_ATTR, findGitLabTargets } from '~/contentScripts/comark/hosting'
import { renderArticle, rewriteRelativeUrls, transformFences } from '~/contentScripts/comark/transform'

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  const article = document.querySelector<HTMLElement>('article.markdown-body')
  if (!article)
    throw new Error('fixture has no article')
  return article
}

function mountEmpty(): HTMLElement {
  document.body.innerHTML = '<article class="markdown-body"></article>'
  return document.querySelector<HTMLElement>('article.markdown-body')!
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('renderArticle: landing page fixture (the page that broke v1)', () => {
  it('renders every top-level component as a highlighted block', async () => {
    const article = mount(landingHtml)
    await renderArticle(article, landingSource)

    // 11 top-level components in docs/content/index.md
    expect(article.querySelectorAll('[data-comark="block"]')).toHaveLength(11)
    expect(article.querySelector('[data-comark-component="landing-hero"]')).toBeTruthy()

    // GitHub's broken setext-heading rendering is gone
    for (const heading of article.querySelectorAll('h1, h2'))
      expect(heading.textContent).not.toMatch(/^::/)
  })

  it('keeps the frontmatter table', async () => {
    const article = mount(landingHtml)
    const table = article.querySelector('markdown-accessiblity-table')
    expect(table).toBeTruthy()
    await renderArticle(article, landingSource)
    expect(article.querySelector('markdown-accessiblity-table')).toBe(table)
  })

  it('reconstructs component sources with their YAML props', async () => {
    const article = mount(landingHtml)
    await renderArticle(article, landingSource)
    const hero = article.querySelector('[data-comark-component="landing-hero"]')!
    expect(hero.textContent).toContain('::landing-hero')
    expect(hero.textContent).toContain('title: Parse and render Markdown anywhere')
  })
})

describe('renderArticle: components docs fixture', () => {
  it('renders the top-level components as highlighted blocks', async () => {
    const article = mount(componentsHtml)
    await renderArticle(article, componentsSource)
    // 9 top-level components in the docs page
    expect(article.querySelectorAll('[data-comark="block"]')).toHaveLength(9)
    // regular prose survives
    expect(article.textContent).toContain('Comark extends standard Markdown with component syntax')
  })

  it('highlights mdc fences through the rangi plugin', async () => {
    const article = mount(componentsHtml)
    await renderArticle(article, componentsSource)
    const fence = article.querySelector('pre.shj code.language-mdc')
    expect(fence).toBeTruthy()
    expect(fence!.querySelectorAll('span').length).toBeGreaterThan(0)
  })
})

describe('renderArticle: comark syntax display', () => {
  it('shows attribute groups as highlighted inline code, not applied', async () => {
    const article = mountEmpty()
    await renderArticle(article, 'Some **bold**{.accent} text.\n')
    const strong = article.querySelector('strong')!
    expect(strong.classList.contains('accent')).toBe(false)
    const inline = article.querySelector('[data-comark="inline"]')!
    expect(inline.textContent).toBe('{.accent}')
  })

  it('shows trailing heading attributes as inline code', async () => {
    const article = mountEmpty()
    await renderArticle(article, '# Hello {.intro}\n')
    expect(article.querySelector('h1')!.getAttribute('class')).toBeNull()
    expect(article.querySelector('h1 [data-comark="inline"]')!.textContent).toBe('{.intro}')
  })

  it('shows spans with attributes as one inline fragment', async () => {
    const article = mountEmpty()
    await renderArticle(article, 'A [span text]{.mark} here.\n')
    const inline = article.querySelector('[data-comark="inline"]')!
    expect(inline.textContent).toBe('[span text]{.mark}')
  })

  it('shows inline components as highlighted inline code', async () => {
    const article = mountEmpty()
    await renderArticle(article, 'Click :button[Submit]{type="primary"} now.\n')
    const inline = article.querySelector('[data-comark="inline"]')!
    expect(inline.textContent).toBe(':button[Submit]{type="primary"}')
  })

  it('shows bindings as inline code', async () => {
    const article = mountEmpty()
    await renderArticle(article, 'Hello {{ user.name || Anonymous }}!\n')
    const inline = article.querySelector('[data-comark="inline"]')!
    expect(inline.textContent).toBe('{{ user.name || Anonymous }}')
  })

  it('renders markdown inside regular elements normally', async () => {
    const article = mountEmpty()
    await renderArticle(article, '# Title\n\nJust **bold** and a [link](https://a.dev).\n\n- [x] done\n')
    expect(article.querySelector('h1')!.textContent).toBe('Title')
    expect(article.querySelector('strong')!.textContent).toBe('bold')
    expect(article.querySelector('a')!.getAttribute('href')).toBe('https://a.dev')
    expect(article.querySelector('input[type="checkbox"]')).toBeTruthy()
  })
})

describe('renderArticle: security', () => {
  it('drops script and iframe tags', async () => {
    const article = mountEmpty()
    await renderArticle(article, '<script>alert(1)</script>\n\n<iframe src="https://evil.dev"></iframe>\n\nSafe text.\n')
    expect(article.querySelector('script')).toBeNull()
    expect(article.querySelector('iframe')).toBeNull()
    expect(article.textContent).toContain('Safe text.')
  })

  it('strips event handler attributes', async () => {
    const article = mountEmpty()
    await renderArticle(article, '<img src="x.png" onerror="alert(1)">\n')
    const img = article.querySelector('img')
    expect(img).toBeTruthy()
    expect(img!.getAttribute('onerror')).toBeNull()
  })

  it('does not render javascript: links', async () => {
    const article = mountEmpty()
    await renderArticle(article, '[click](javascript:alert(1))\n')
    for (const link of article.querySelectorAll('a'))
      expect(link.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
  })
})

describe('rewriteRelativeUrls', () => {
  const rawUrl = 'https://raw.githubusercontent.com/owner/repo/main/docs/content/index.md'

  it('resolves relative images against the raw file directory', () => {
    const article = mountEmpty()
    article.innerHTML = '<img src="./img/logo.png"><img src="../shared.png"><img src="https://a.dev/x.png">'
    rewriteRelativeUrls(article, rawUrl)
    const [first, second, third] = article.querySelectorAll('img')
    expect(first.getAttribute('src')).toBe('https://raw.githubusercontent.com/owner/repo/main/docs/content/img/logo.png')
    expect(second.getAttribute('src')).toBe('https://raw.githubusercontent.com/owner/repo/main/docs/shared.png')
    expect(third.getAttribute('src')).toBe('https://a.dev/x.png')
  })

  it('resolves relative links against the blob directory', () => {
    const article = mountEmpty()
    article.innerHTML = '<a href="./other.md">a</a><a href="#anchor">b</a><a href="/site">c</a>'
    rewriteRelativeUrls(article, rawUrl)
    const [first, second, third] = article.querySelectorAll('a')
    expect(first.getAttribute('href')).toBe('https://github.com/owner/repo/blob/main/docs/content/other.md')
    expect(second.getAttribute('href')).toBe('#anchor')
    expect(third.getAttribute('href')).toBe('/site')
  })

  it('resolves GitLab links against the blob directory', () => {
    const article = mountEmpty()
    article.innerHTML = '<img src="./img/logo.png"><a href="../other.md">a</a>'
    rewriteRelativeUrls(article, 'https://gitlab.com/group/project/-/raw/main/docs/content/index.md')
    expect(article.querySelector('img')!.getAttribute('src')).toBe('https://gitlab.com/group/project/-/raw/main/docs/content/img/logo.png')
    expect(article.querySelector('a')!.getAttribute('href')).toBe('https://gitlab.com/group/project/-/blob/main/docs/other.md')
  })
})

describe('transformFences (non-comark pages)', () => {
  it('highlights mdc fences from the real fixture', () => {
    const article = mount(componentsHtml)
    const before = Array.from(article.querySelectorAll('pre[lang="mdc"]'))
      .map(pre => pre.textContent)
    expect(before.length).toBeGreaterThan(0)

    const count = transformFences(article)
    expect(count).toBe(before.length)

    const after = Array.from(article.querySelectorAll('pre[data-comark="fence"]'))
    expect(after).toHaveLength(before.length)
    // the text is unchanged: only spans got added
    expect(after.map(pre => pre.textContent)).toEqual(before)
    expect(after[0].querySelectorAll('span[class^="shj-"]').length).toBeGreaterThan(0)
  })

  it('is idempotent', () => {
    const article = mount(componentsHtml)
    const first = transformFences(article)
    expect(first).toBeGreaterThan(0)
    expect(transformFences(article)).toBe(0)
  })

  it('leaves other languages alone', () => {
    const article = mount(
      '<article class="markdown-body">'
      + '<pre lang="python"><code>print("hi")</code></pre>'
      + '<pre lang="mdc"><code>::alert\nhi\n::</code></pre>'
      + '</article>',
    )
    expect(transformFences(article)).toBe(1)
    expect(article.querySelector('pre[lang="python"] span')).toBeNull()
  })

  it('escapes HTML in the fence source', () => {
    const article = mount(
      '<article class="markdown-body"><pre lang="mdc"><code>::alert\na &lt;b&gt; tag\n::</code></pre></article>',
    )
    transformFences(article)
    expect(article.querySelector('pre code')!.textContent).toBe('::alert\na <b> tag\n::')
    expect(article.querySelector('pre code b')).toBeNull()
  })

  it('highlights GitLab language classes', () => {
    const article = mount('<article class="markdown-body"><pre><code class="language-mdc">::alert\nhi\n::</code></pre></article>')
    expect(transformFences(article)).toBe(1)
    expect(article.querySelector('pre[data-comark="fence"]')).toBeTruthy()
  })
})

describe('findTargets: GitLab', () => {
  it('finds Markdown blob previews and resolves the GitLab raw URL', () => {
    window.history.pushState({}, '', '/group/project/-/blob/main/docs/example.md')
    document.body.innerHTML = '<div class="file-content js-markup-content md"></div>'

    const [target] = findGitLabTargets()
    expect(target.article.classList).toContain('md')
    expect(target.rawUrls).toEqual(['http://localhost/group/project/-/raw/main/docs/example.md'])
    target.article.setAttribute(PROCESSED_ATTR, '1')
    expect(findGitLabTargets()).toEqual([])
  })

  it('uses the rendered README link for a nested project', () => {
    window.history.pushState({}, '', '/group/subgroup/project')
    document.body.innerHTML = '<div class="readme-holder"><a href="/group/subgroup/project/-/blob/main/README.md">README.md</a><div class="file-content js-markup-content md"></div></div>'

    const [target] = findGitLabTargets()
    expect(target.rawUrls[0]).toBe('http://localhost/group/subgroup/project/-/raw/main/README.md')
  })
})
