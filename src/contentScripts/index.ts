import { PROCESSED_ATTR, fetchRawSource, findTargets, onContentChange } from './comark/github'
import { hasComarkSyntax } from './comark/scanner'
import { renderArticle, transformFences } from './comark/transform'
import './comark/style.css'

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
(() => {
  const STORAGE_KEY = 'comark-enabled'

  function injectStyles() {
    if (document.head.querySelector('link[data-comark-style]'))
      return
    const styleEl = document.createElement('link')
    styleEl.setAttribute('rel', 'stylesheet')
    styleEl.setAttribute('href', browser.runtime.getURL('dist/contentScripts/style.css'))
    styleEl.setAttribute('data-comark-style', '')
    document.head.appendChild(styleEl)
  }

  async function isEnabled(): Promise<boolean> {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEY)
      // the popup writes through vueuse serializers: booleans are strings
      return stored[STORAGE_KEY] !== 'false'
    }
    catch {
      return true
    }
  }

  async function processPage() {
    if (!await isEnabled())
      return

    for (const target of findTargets()) {
      // claim the article before awaiting, so overlapping runs skip it
      target.article.setAttribute(PROCESSED_ATTR, 'pending')

      let count = 0
      const raw = await fetchRawSource(target.rawUrls)
      if (target.article.isConnected && raw !== null && hasComarkSyntax(raw.text)) {
        injectStyles()
        try {
          count = await renderArticle(target.article, raw.text, raw.url)
        }
        catch (error) {
          console.warn('[comark] render failed, falling back to fence highlighting', error)
          count = transformFences(target.article)
        }
      }
      else if (target.article.isConnected) {
        // plain markdown page: only highlight ```mdc fences in place
        count = transformFences(target.article)
        if (count > 0)
          injectStyles()
      }
      target.article.setAttribute(PROCESSED_ATTR, String(count))
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY])
      location.reload()
  })

  onContentChange(() => {
    processPage()
  })
})()
