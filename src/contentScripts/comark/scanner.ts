/**
 * Comark source scanner.
 *
 * Finds the comark-specific constructs in a raw markdown source: block
 * components, inline components, spans and attribute groups. The regex
 * building blocks mirror the comark rangi grammar
 * (`comark/plugins/rangi/language`).
 *
 * The scanner works on the raw source because GitHub's rendered DOM is lossy:
 * the markdown inside a component body is already converted to HTML there.
 */

/** A component name: same grammar as the comark parser. */
const NAME = String.raw`[a-z$][\w$-]*`

/** A `{...}` attributes group, quote aware so `{title="a } b"}` stays whole. */
const ATTRS = String.raw`\{(?:[^{}'"]|'[^']*'|"[^"]*")*\}`

/** A `[...]` slot / span body. */
const SLOT = String.raw`\[[^\]]*\]`

const RE_BLOCK_OPEN = new RegExp(`^\\s*(:{2,})(${NAME})`, 'i')
const RE_BLOCK_CLOSE = /^\s*:{2,}\s*$/
const RE_FENCE_MARKER = /^ {0,3}(`{3,}|~{3,})/
const RE_FRONTMATTER_DELIMITER = /^---\s*$/

const RE_INLINE_COMPONENT = new RegExp(
  `(?<=^|[\\s*_[(]):${NAME}(?:${ATTRS})?(?:${SLOT})?(?:${ATTRS})?(?![\\w$:-])`,
  'gi',
)
const RE_SPAN = new RegExp(`${SLOT}${ATTRS}`, 'g')
const RE_BINDING = /\{\{[^{}]*\}\}/g
const RE_ATTRS = new RegExp(ATTRS, 'g')
const RE_INLINE_CODE = /`[^`\n]*`/g

export interface BlockComponentRegion {
  type: 'block-component'
  name: string
  /** Full source slice, opening and closing lines included. */
  source: string
  /** First line, trimmed — the DOM anchor. */
  openingLine: string
  /** Colon-only closing lines in the region, fenced lines excluded. */
  closerLineCount: number
}

export type InlineFragmentType = 'inline-component' | 'span' | 'attributes' | 'binding'

export interface InlineFragment {
  type: InlineFragmentType
  /** The literal fragment, exactly as it appears in the source and the DOM. */
  text: string
}

export interface ScanResult {
  blocks: BlockComponentRegion[]
  inline: InlineFragment[]
}

/**
 * `{...}` content that plausibly is a comark attribute group. Requires a
 * `.class`, `#id` or `key=value` marker so prose like `{example}` stays
 * untouched (boolean-only groups are skipped on purpose).
 */
export function isAttributesContent(inner: string): boolean {
  const trimmed = inner.trim()
  if (!trimmed || !/[.#=]/.test(trimmed))
    return false
  const token = String.raw`(?:[.#][^\s.#}='"]+|[:@]?[\w$-]+(?:=(?:"[^"]*"|'[^']*'|[^\s}'"][^\s}]*))?)`
  return new RegExp(`^${token}(?:\\s+${token})*$`).test(trimmed)
}

interface Candidate {
  type: InlineFragmentType
  start: number
  end: number
  text: string
}

/** Priority on equal start positions: first wins. */
const TYPE_ORDER: InlineFragmentType[] = ['inline-component', 'span', 'binding', 'attributes']

function collectInline(line: string, out: InlineFragment[], seen: Set<string>): void {
  // inline code spans are rendered by GitHub as <code> and left alone
  const scannable = line.replace(RE_INLINE_CODE, match => ' '.repeat(match.length))

  const candidates: Candidate[] = []
  const collect = (re: RegExp, type: InlineFragmentType, filter?: (m: RegExpExecArray) => boolean) => {
    re.lastIndex = 0
    for (let m = re.exec(scannable); m; m = re.exec(scannable)) {
      if (!filter || filter(m))
        candidates.push({ type, start: m.index, end: m.index + m[0].length, text: m[0] })
    }
  }

  collect(RE_INLINE_COMPONENT, 'inline-component')
  collect(RE_SPAN, 'span')
  collect(RE_BINDING, 'binding')
  collect(RE_ATTRS, 'attributes', m => isAttributesContent(m[0].slice(1, -1)))

  candidates.sort((a, b) =>
    a.start - b.start
    || (b.end - b.start) - (a.end - a.start)
    || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))

  let cursor = -1
  for (const candidate of candidates) {
    if (candidate.start < cursor)
      continue
    cursor = candidate.end
    if (seen.has(candidate.text))
      continue
    seen.add(candidate.text)
    out.push({ type: candidate.type, text: candidate.text })
  }
}

export function scan(source: string): ScanResult {
  const lines = source.split(/\r?\n/)
  const blocks: BlockComponentRegion[] = []
  const inline: InlineFragment[] = []
  const seen = new Set<string>()

  let start = 0
  // skip the YAML frontmatter — GitHub renders it as a table
  if (lines.length > 0 && RE_FRONTMATTER_DELIMITER.test(lines[0])) {
    for (let i = 1; i < lines.length; i++) {
      if (RE_FRONTMATTER_DELIMITER.test(lines[i])) {
        start = i + 1
        break
      }
    }
  }

  let fence: { char: string, length: number } | null = null
  let block: {
    name: string
    openingLine: string
    startIndex: number
    depth: number
    closerLineCount: number
  } | null = null

  for (let i = start; i < lines.length; i++) {
    const line = lines[i]

    if (fence) {
      const close = line.match(RE_FENCE_MARKER)
      if (close
        && close[1][0] === fence.char
        && close[1].length >= fence.length
        && /^[ \t]*$/.test(line.slice(close[0].length))) {
        fence = null
      }
      continue
    }

    const fenceOpen = line.match(RE_FENCE_MARKER)
    if (fenceOpen) {
      const info = line.slice(fenceOpen[0].length)
      // a backtick fence cannot carry backticks in its info string
      if (!(fenceOpen[1][0] === '`' && info.includes('`'))) {
        fence = { char: fenceOpen[1][0], length: fenceOpen[1].length }
        continue
      }
    }

    if (block) {
      if (RE_BLOCK_CLOSE.test(line)) {
        block.closerLineCount++
        block.depth--
        if (block.depth === 0) {
          blocks.push({
            type: 'block-component',
            name: block.name,
            source: lines.slice(block.startIndex, i + 1).join('\n'),
            openingLine: block.openingLine,
            closerLineCount: block.closerLineCount,
          })
          block = null
        }
      }
      else if (RE_BLOCK_OPEN.test(line)) {
        block.depth++
      }
      continue
    }

    const open = line.match(RE_BLOCK_OPEN)
    if (open) {
      block = {
        name: open[2],
        openingLine: line.trim(),
        startIndex: i,
        depth: 1,
        closerLineCount: 0,
      }
      continue
    }

    collectInline(line, inline, seen)
  }

  // an unterminated block component reaches the end of the document
  if (block) {
    blocks.push({
      type: 'block-component',
      name: block.name,
      source: lines.slice(block.startIndex).join('\n'),
      openingLine: block.openingLine,
      closerLineCount: block.closerLineCount,
    })
  }

  return { blocks, inline }
}

/** Cheap gate: does this markdown source use any comark syntax at all? */
export function hasComarkSyntax(source: string): boolean {
  const { blocks, inline } = scan(source)
  return blocks.length > 0 || inline.length > 0
}
