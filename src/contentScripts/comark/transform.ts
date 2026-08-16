/**
 * DOM transforms on rendered Markdown from supported Git hosts.
 *
 * Comark pages get a full re-render: the raw source goes through the real
 * comark parser (see `renderer.ts`) and the result replaces GitHub's lossy
 * rendering. Components become highlighted code blocks; attribute groups and
 * spans stay literal and get wrapped as highlighted inline code by the DOM
 * pass below.
 *
 * Non-comark pages keep GitHub's rendering; only ` ```mdc ` fences get
 * highlighted in place.
 */

import type { InlineFragment } from './scanner'
import { highlightInline, highlightTokens } from './highlight'
import { renderComarkHtml } from './renderer'
import { scan } from './scanner'

/** Code-fence wrappers used by supported Git hosts. */
const CODE_CONTAINER = 'pre, .highlight, .snippet-clipboard-content'

const INLINE_HOSTS = new Set(['STRONG', 'EM', 'A', 'CODE', 'IMG', 'DEL', 'B', 'I', 'SUP', 'SUB', 'SPAN'])

/**
 * Parses an HTML string into inert nodes. DOMParser (instead of innerHTML)
 * keeps the AMO linter quiet: the parsed document cannot run scripts, and
 * nodes are adopted into the page only on insertion.
 */
function parseHtml(html: string): Node[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.body.childNodes)
}

function htmlToElement(html: string): HTMLElement | null {
  const [first] = parseHtml(html)
  return first instanceof HTMLElement ? first : null
}

function isValidAttributesPosition(node: Text, index: number, length: number): boolean {
  const text = node.nodeValue ?? ''
  // right after an inline element: <strong>bold</strong>{.x}
  if (index === 0) {
    const previous = node.previousSibling
    if (previous instanceof Element && INLINE_HOSTS.has(previous.tagName))
      return true
  }
  // trailing block attributes: "A paragraph {attr}" / "# Heading {.intro}"
  const tail = text.slice(index + length)
  return /^\s*$/.test(tail) && node.nextSibling === null
}

function collectTextNodes(article: HTMLElement): Text[] {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent)
        return NodeFilter.FILTER_REJECT
      if (parent.closest(`code, script, style, [data-comark], ${CODE_CONTAINER}`))
        return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    nodes.push(node as Text)
  return nodes
}

/** Wraps literal comark fragments in text nodes as highlighted inline code. */
export function transformInline(article: HTMLElement, fragments: InlineFragment[]): number {
  if (fragments.length === 0)
    return 0
  let count = 0

  for (const textNode of collectTextNodes(article)) {
    let node: Text | null = textNode
    while (node) {
      const text: string = node.nodeValue ?? ''
      if (!text) {
        break
      }

      let best: { fragment: InlineFragment, index: number } | null = null
      for (const fragment of fragments) {
        const index = text.indexOf(fragment.text)
        if (index === -1)
          continue
        if (fragment.type === 'attributes' && !isValidAttributesPosition(node, index, fragment.text.length))
          continue
        if (!best || index < best.index)
          best = { fragment, index }
      }
      if (!best)
        break

      const highlighted = htmlToElement(highlightInline(best.fragment.text))
      if (!highlighted)
        break
      highlighted.setAttribute('data-comark', 'inline')

      const rest = node.splitText(best.index)
      rest.nodeValue = (rest.nodeValue ?? '').slice(best.fragment.text.length)
      rest.parentNode?.insertBefore(highlighted, rest)
      count++
      node = rest
    }
  }
  return count
}

/** Fence languages GitHub cannot highlight but comark can. */
const FENCE_LANGS = new Set(['mdc', 'comark'])

/**
 * Highlights fenced code blocks tagged with a comark language (` ```mdc `).
 * Git hosts leave unknown languages as plain text, and the source is right in
 * the DOM, so this needs no raw markdown fetch. The host's `<pre>` shell and
 * copy button stay in place.
 */
export function transformFences(article: HTMLElement): number {
  let count = 0
  for (const pre of article.querySelectorAll<HTMLElement>('pre')) {
    const code = pre.querySelector('code')
    const lang = pre.getAttribute('lang')?.toLowerCase()
      ?? pre.dataset.canonicalLang?.toLowerCase()
      ?? Array.from(code?.classList ?? []).find(name => name.startsWith('language-'))?.slice('language-'.length)?.toLowerCase()
    if (!lang || !FENCE_LANGS.has(lang))
      continue
    if (pre.closest('[data-comark]'))
      continue
    if (!code)
      continue
    code.replaceChildren(...parseHtml(highlightTokens(code.textContent ?? '')))
    pre.setAttribute('data-comark', 'fence')
    count++
  }
  return count
}

const RELATIVE_URL = /^(?![a-z][\w+.-]*:|\/|#)/i

/**
 * Resolves relative image and link URLs against the document's location in
 * the repository. The host did this in its own rendering; a re-render must
 * redo it.
 */
export function rewriteRelativeUrls(article: HTMLElement, rawUrl: string): void {
  const rawBase = rawUrl.slice(0, rawUrl.lastIndexOf('/') + 1)
  const blobBase = rawBase
    // raw.githubusercontent.com/{owner}/{repo}/{ref-and-dir}/ -> GitHub blob dir
    .replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//, 'https://github.com/$1/$2/blob/')
    // gitlab.com/{namespace}/{project}/-/raw/{ref-and-dir}/ -> GitLab blob dir
    .replace(/\/-\/raw\//, '/-/blob/')

  for (const img of article.querySelectorAll<HTMLImageElement>('img[src]')) {
    const src = img.getAttribute('src') ?? ''
    if (RELATIVE_URL.test(src))
      img.setAttribute('src', new URL(src, rawBase).href)
  }
  for (const link of article.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = link.getAttribute('href') ?? ''
    if (RELATIVE_URL.test(href))
      link.setAttribute('href', new URL(href, blobBase).href)
  }
}

/**
 * Replaces a host's rendering of one markdown article with the comark
 * rendering of its raw source. A host frontmatter table is kept. Throws on
 * render failure: the caller keeps the host's DOM and falls back to fences.
 */
export async function renderArticle(article: HTMLElement, source: string, rawUrl?: string): Promise<number> {
  const html = await renderComarkHtml(source)

  const frontmatterTable = article.querySelector('markdown-accessiblity-table')
  const replacement = parseHtml(html)

  article.replaceChildren()
  if (frontmatterTable)
    article.appendChild(frontmatterTable)
  article.append(...replacement)

  if (rawUrl)
    rewriteRelativeUrls(article, rawUrl)

  const { inline } = scan(source)
  const count = 1 + transformInline(article, inline)
  return count
}
