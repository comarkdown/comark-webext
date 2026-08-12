import comarkLanguage from 'comark/plugins/rangi/language'
import { codeToHtml, tokenize } from 'rangi'

const languages = { comark: comarkLanguage }

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Highlights a comark source block.
 * Returns a `<div class="shj shj-lang-comark ...">` markup string, styled by
 * `style.css` (rangi's `classes` mode emits no inline styles).
 */
export function highlightBlock(source: string): string {
  return codeToHtml(source, {
    lang: 'comark',
    languages,
    classes: true,
    lineNumbers: false,
  })
}

/**
 * Highlights comark source as bare `<span class="shj-...">` tokens, with no
 * wrapper element. Fits inside an existing `<code>` element, like GitHub's
 * own fenced code blocks.
 */
export function highlightTokens(source: string): string {
  return tokenize(source, { lang: 'comark', languages })
    .map(token => token.type
      ? `<span class="shj-${token.type}">${escapeHtml(token.text)}</span>`
      : escapeHtml(token.text))
    .join('')
}

/**
 * Highlights a comark fragment as an inline `<code class="shj ...">` element.
 */
export function highlightInline(source: string): string {
  return codeToHtml(source, {
    lang: 'comark',
    languages,
    classes: true,
    inline: true,
  })
}
