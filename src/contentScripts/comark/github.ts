/**
 * GitHub page detection and raw markdown source resolution.
 *
 * Supported targets (MVP):
 * - `.md` blob previews (`/{owner}/{repo}/blob/{ref}/{path}`)
 * - rendered READMEs on repo home and tree pages
 */

const MARKDOWN_EXTENSIONS = /\.(?:md|mdc|markdown|mdown)$/i

export interface PageTarget {
  article: HTMLElement
  /** Raw source URL candidates, tried in order. */
  rawUrls: string[]
}

export const PROCESSED_ATTR = 'data-comark-processed'

function parsePath(): { owner: string, repo: string, rest: string[] } | null {
  const segments = location.pathname.split('/').filter(Boolean)
  if (segments.length < 2)
    return null
  const [owner, repo, ...rest] = segments
  return { owner, repo, rest }
}

function rawUrl(owner: string, repo: string, refAndPath: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${refAndPath}`
}

/** Finds a README blob link near the article, to get the exact file path. */
function readmePathFromDom(article: HTMLElement): string | null {
  const container = article.closest('[data-testid="readme"], .Box, section, div')
  const scope = container ?? document
  const links = scope.querySelectorAll<HTMLAnchorElement>('a[href*="/blob/"]')
  for (const link of links) {
    const href = link.getAttribute('href') ?? ''
    if (/readme[^/]*$/i.test(href) && MARKDOWN_EXTENSIONS.test(href))
      return href
  }
  return null
}

export function findTargets(): PageTarget[] {
  const parsed = parsePath()
  if (!parsed)
    return []
  const { owner, repo, rest } = parsed

  const articles = Array.from(
    document.querySelectorAll<HTMLElement>(`article.markdown-body:not([${PROCESSED_ATTR}])`),
  )
  if (articles.length === 0)
    return []

  // blob preview: /{owner}/{repo}/blob/{ref}/{path}.md
  if (rest[0] === 'blob' && rest.length >= 3 && MARKDOWN_EXTENSIONS.test(rest[rest.length - 1])) {
    const refAndPath = rest.slice(1).map(decodeURIComponent).map(encodeURIComponent).join('/')
    return articles.map(article => ({
      article,
      rawUrls: [rawUrl(owner, repo, refAndPath)],
    }))
  }

  // repo home or tree page: rendered README
  const isHome = rest.length === 0
  const isTree = rest[0] === 'tree' && rest.length >= 2
  if (!isHome && !isTree)
    return []

  const refAndDir = isHome ? 'HEAD' : rest.slice(1).join('/')

  return articles.map((article) => {
    const rawUrls: string[] = []
    const domPath = readmePathFromDom(article)
    if (domPath) {
      // /{owner}/{repo}/blob/{ref}/{path} -> {ref}/{path}
      const match = domPath.match(/\/blob\/(.+)$/)
      if (match)
        rawUrls.push(rawUrl(owner, repo, match[1]))
    }
    for (const name of ['README.md', 'readme.md', 'README.mdc'])
      rawUrls.push(rawUrl(owner, repo, `${refAndDir}/${name}`))
    return { article, rawUrls }
  })
}

export interface RawSource {
  url: string
  text: string
}

const sourceCache = new Map<string, string | null>()

/** Fetches the first raw URL that answers 200. Results are cached. */
export async function fetchRawSource(urls: string[]): Promise<RawSource | null> {
  for (const url of urls) {
    if (sourceCache.has(url)) {
      const cached = sourceCache.get(url)!
      if (cached !== null)
        return { url, text: cached }
      continue
    }
    try {
      const response = await fetch(url, { credentials: 'omit' })
      if (!response.ok) {
        sourceCache.set(url, null)
        continue
      }
      const text = await response.text()
      sourceCache.set(url, text)
      return { url, text }
    }
    catch {
      sourceCache.set(url, null)
    }
  }
  return null
}

/**
 * Runs the callback now and after every GitHub soft navigation. GitHub swaps
 * page content without full reloads, so a MutationObserver backs up the
 * navigation events.
 */
export function onContentChange(callback: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(callback, 150)
  }

  document.addEventListener('turbo:load', schedule)
  document.addEventListener('soft-nav:end', schedule)
  window.addEventListener('popstate', schedule)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement
          && (node.matches('article.markdown-body') || node.querySelector('article.markdown-body'))) {
          schedule()
          return
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  callback()
}
