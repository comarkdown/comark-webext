/**
 * Full comark HTML rendering of a markdown source.
 *
 * The raw markdown is parsed by the real comark parser and rendered to HTML,
 * so GitHub's lossy rendering is bypassed entirely. Comark-specific syntax is
 * displayed* instead of applied:
 *
 * - components (block and inline) render as highlighted code of their source
 * - the `attributes` plugin stays disabled, so `{...}` groups and `[span]{...}`
 *   remain literal text — a later DOM pass wraps them in highlighted code
 */

import type { ElementNode, NodeHandler } from 'comark'
import { createHtmlRenderer } from '@comark/html'
import alert from '@comark/html/plugins/alert'
import components from '@comark/html/plugins/components'
import frontmatter from '@comark/html/plugins/frontmatter'
import html from '@comark/html/plugins/html'
import rangi from '@comark/html/plugins/rangi'
import security from '@comark/html/plugins/security'
import taskList from '@comark/html/plugins/task-list'
import { renderMarkdown } from 'comark/render'
import { github } from 'rangi/themes'
import { escapeHtml, highlightBlock } from './highlight'

/** Tags the markdown pipeline itself can produce: never comark components. */
const NATIVE_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'br',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'em',
  'strong',
  'a',
  'img',
  'del',
  'input',
  'span',
  'div',
  'section',
  'sup',
  'sub',
  'details',
  'summary',
])

/** Parents that put a node in inline (phrasing) context. */
const PHRASING_PARENTS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'td',
  'th',
  'em',
  'strong',
  'a',
  'span',
  'del',
  'sup',
  'sub',
])

/** Raw HTML elements that must never render on github.com. */
const BLOCKED_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'link',
  'meta',
  'base',
  'template',
  'slot',
]

function isRawHtml(node: ElementNode): boolean {
  return (node[1] as { $?: { html?: 0 | 1 } } | undefined)?.$?.html === 1
}

function isComponent(node: ElementNode): boolean {
  return typeof node[0] === 'string' && !NATIVE_TAGS.has(node[0]) && !isRawHtml(node)
}

/** Serializes resolved attributes back to comark's inline `{...}` syntax. */
function serializeAttributes(attrs: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(attrs)) {
    if (key === '$')
      continue
    if (key === 'id') {
      parts.push(`#${value}`)
    }
    else if (key === 'class') {
      for (const name of String(value).split(/\s+/).filter(Boolean))
        parts.push(`.${name}`)
    }
    else if (value === true || value === 'true') {
      parts.push(key)
    }
    else if (typeof value === 'object' && value !== null) {
      parts.push(`${key}='${JSON.stringify(value)}'`)
    }
    else {
      parts.push(`${key}="${String(value)}"`)
    }
  }
  return parts.join(' ')
}

/**
 * Reconstructs the `:name[content]{attrs}` inline component source. Without
 * the attributes plugin the `{attrs}` part stays as literal text right after
 * the node, so only `:name[content]` is rebuilt here — emitted as literal
 * text, both pieces merge into one text node that the inline DOM pass wraps
 * as a single highlighted fragment.
 */
async function inlineComponentSource(node: ElementNode): Promise<string> {
  const [tag, attrs, ...children] = node
  let source = `:${tag}`
  if (children.length > 0) {
    const body = (await renderMarkdown({ nodes: children as ElementNode[] })).trim()
    if (body)
      source += `[${body}]`
  }
  const serialized = serializeAttributes((attrs ?? {}) as Record<string, unknown>)
  if (serialized)
    source += `{${serialized}}`
  return source
}

/** Renders any unknown element — a comark component — as highlighted code. */
const componentHandler: NodeHandler = async (node, _state, parent) => {
  const inline = parent !== undefined && PHRASING_PARENTS.has(parent[0] as string)
  if (inline)
    return escapeHtml(await inlineComponentSource(node))
  const source = (await renderMarkdown({ nodes: [node] })).trimEnd()
  return `<div class="comark-block" data-comark="block" data-comark-component="${escapeHtml(String(node[0]))}">${highlightBlock(source)}</div>`
}

/**
 * `[text]{attrs}` spans parse to a `span` node even without the attributes
 * plugin. Emit the literal `[text]` again, so the span plus its trailing
 * `{attrs}` text reads as the original source, which the inline DOM pass then
 * wraps as one highlighted fragment. Raw HTML `<span>` elements fall through
 * to the default handler.
 */
const spanHandler: NodeHandler = async (node) => {
  const body = (await renderMarkdown({ nodes: node.slice(2) as ElementNode[] })).trim()
  return escapeHtml(`[${body}]`)
}

const renderComarkHtmlImpl = createHtmlRenderer({
  // all defaults except `attributes`: `{...}` stays literal, to be displayed
  registerDefaultPlugins: false,
  // bare-domain linkify would mangle `{{ user.name }}` bindings
  linkify: false,
  plugins: [
    frontmatter(),
    html(),
    alert(),
    taskList(),
    components(),
    security({ blockedTags: BLOCKED_TAGS }),
    // GitHub's prettylights palette as a light/dark pair: tokens carry the
    // light color inline plus a `--shiki-dark` var that style.css switches on
    rangi({ theme: github }),
  ],
  components: {
    comarkSpan: {
      // only attribute-less spans are `[text]` syntax; spans carrying
      // class/style (e.g. rangi highlight tokens) pass through untouched
      match: node => node[0] === 'span'
      && !isRawHtml(node)
      && Object.keys(node[1] ?? {}).every(key => key === '$'),
      handler: spanHandler,
    },
    comarkComponent: {
      match: isComponent,
      handler: componentHandler,
    },
  },
})

/** Renders raw markdown to comark HTML. Throws on failure: callers fall back. */
export function renderComarkHtml(source: string): Promise<string> {
  return renderComarkHtmlImpl(source)
}
