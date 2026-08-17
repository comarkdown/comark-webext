/**
 * Git hosting page detection and raw Markdown source resolution.
 *
 * Supported targets:
 * - GitHub `.md` blob previews and rendered READMEs
 * - GitLab `.md` blob previews and rendered READMEs
 */

const MARKDOWN_EXTENSIONS = /\.(?:md|mdc|markdown|mdown)$/i

export interface PageTarget {
  article: HTMLElement
  /** Raw source URL candidates, tried in order. */
  rawUrls: string[]
}

export const PROCESSED_ATTR = 'data-comark-processed'

function encodedPath(segments: string[]): string {
  return segments.map(decodeURIComponent).map(encodeURIComponent).join('/')
}

const GITLAB_MARKDOWN = '.file-content.js-markup-content, .file-content.md, .file-content .md, .readme-holder .md'
const MARKDOWN_TARGET_ADDED = 'article.markdown-body, .file-content.js-markup-content, .file-content.md, .readme-holder'

function getArticles(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter(article => !article.hasAttribute(PROCESSED_ATTR))
}

function githubRawUrl(owner: string, repo: string, refAndPath: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${refAndPath}`
}

/** Finds a README blob link near the rendered article, to get its exact path. */
function readmePathFromDom(article: HTMLElement, marker: string): string | null {
  // start from the parent: GitLab articles are plain divs, so a `closest`
  // from the article itself would match the article and miss sibling links
  const container = article.parentElement?.closest('[data-testid="readme"], .readme-holder, .Box, section, div')
  const scope = container ?? document
  for (const link of scope.querySelectorAll<HTMLAnchorElement>(`a[href*="${marker}"]`)) {
    const href = link.getAttribute('href') ?? ''
    if (/readme[^/]*$/i.test(href) && MARKDOWN_EXTENSIONS.test(href))
      return href
  }
  return null
}

function findGitHubTargets(): PageTarget[] {
  const segments = location.pathname.split('/').filter(Boolean)
  if (segments.length < 2)
    return []
  const [owner, repo, ...rest] = segments
  const articles = getArticles('article.markdown-body')
  if (articles.length === 0)
    return []

  if (rest[0] === 'blob' && rest.length >= 3 && MARKDOWN_EXTENSIONS.test(rest[rest.length - 1])) {
    const refAndPath = encodedPath(rest.slice(1))
    return articles.map(article => ({ article, rawUrls: [githubRawUrl(owner, repo, refAndPath)] }))
  }

  const isHome = rest.length === 0
  const isTree = rest[0] === 'tree' && rest.length >= 2
  if (!isHome && !isTree)
    return []

  const refAndDir = isHome ? 'HEAD' : encodedPath(rest.slice(1))
  return articles.map((article) => {
    const rawUrls: string[] = []
    const domPath = readmePathFromDom(article, '/blob/')
    const match = domPath?.match(/\/blob\/(.+)$/)
    if (match)
      rawUrls.push(githubRawUrl(owner, repo, match[1]))
    for (const name of ['README.md', 'readme.md', 'README.mdc'])
      rawUrls.push(githubRawUrl(owner, repo, `${refAndDir}/${name}`))
    return { article, rawUrls }
  })
}

function gitLabRawUrl(projectPath: string, refAndPath: string): string {
  return `${location.origin}/${projectPath}/-/raw/${refAndPath}`
}

export function findGitLabTargets(): PageTarget[] {
  const segments = location.pathname.split('/').filter(Boolean)
  const markerIndex = segments.findIndex(segment => segment === '-')
  const articles = getArticles(GITLAB_MARKDOWN)
  if (articles.length === 0)
    return []

  if (markerIndex >= 2 && segments[markerIndex + 1] === 'blob'
    && markerIndex + 3 < segments.length && MARKDOWN_EXTENSIONS.test(segments[segments.length - 1])) {
    const projectPath = encodedPath(segments.slice(0, markerIndex))
    const refAndPath = encodedPath(segments.slice(markerIndex + 2))
    return articles.map(article => ({ article, rawUrls: [gitLabRawUrl(projectPath, refAndPath)] }))
  }

  const isTree = markerIndex !== -1
  if (isTree && segments[markerIndex + 1] !== 'tree')
    return []

  // Project root (segments = project path) or tree page
  // (/{project}/-/tree/{ref}/{dir}). A project root may be nested under
  // groups. A README link supplies the authoritative project path, ref, and
  // filename; the fallback guesses common names.
  const projectPath = encodedPath(isTree ? segments.slice(0, markerIndex) : segments)
  const refAndDir = isTree ? encodedPath(segments.slice(markerIndex + 2)) : 'HEAD'
  if (!refAndDir)
    return []

  return articles.map((article) => {
    const rawUrls: string[] = []
    const domPath = readmePathFromDom(article, '/-/blob/')
    const match = domPath && new URL(domPath, location.origin).pathname.match(/^\/(.+)\/-\/blob\/(.+)$/)
    if (match)
      rawUrls.push(gitLabRawUrl(match[1], match[2]))

    for (const name of ['README.md', 'readme.md', 'README.mdc'])
      rawUrls.push(gitLabRawUrl(projectPath, `${refAndDir}/${name}`))
    return { article, rawUrls }
  })
}

export function findTargets(): PageTarget[] {
  if (location.hostname === 'github.com')
    return findGitHubTargets()
  if (location.hostname === 'gitlab.com')
    return findGitLabTargets()
  return []
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
      const cached = sourceCache.get(url)
      if (typeof cached === 'string')
        return { url, text: cached }
      continue
    }
    try {
      // GitLab raw files are same-origin, so authenticated project pages can
      // also render private Markdown. GitHub raw files remain cross-origin.
      const response = await fetch(url, {
        credentials: new URL(url).origin === location.origin ? 'same-origin' : 'omit',
      })
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
 * Runs the callback now and after soft navigation. Both hosts replace page
 * content without full reloads, so a MutationObserver backs up navigation
 * events.
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
          && (node.matches(MARKDOWN_TARGET_ADDED) || node.querySelector(MARKDOWN_TARGET_ADDED))) {
          schedule()
          return
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  callback()
}
