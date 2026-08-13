import fs from 'fs-extra'
import type { Manifest } from 'webextension-polyfill'
import type PkgType from '../package.json'
import { isDev, isFirefox, port, r } from '../scripts/utils'

export async function getManifest() {
  const pkg = await fs.readJSON(r('package.json')) as typeof PkgType

  // update this file to update this manifest.json
  // can also be conditional based on your need
  const manifest: Manifest.WebExtensionManifest = {
    manifest_version: 3,
    name: pkg.displayName || pkg.name,
    version: pkg.version,
    description: pkg.description,
    action: {
      default_icon: {
        16: 'assets/icon-16.png',
        48: 'assets/icon-48.png',
        128: 'assets/icon-128.png',
      },
      default_popup: 'dist/popup/index.html',
    },
    background: isFirefox
      ? {
          scripts: ['dist/background/index.mjs'],
          type: 'module',
        }
      : {
          service_worker: 'dist/background/index.mjs',
        },
    icons: {
      16: 'assets/icon-16.png',
      48: 'assets/icon-48.png',
      128: 'assets/icon-128.png',
      512: 'assets/icon-512.png',
    },
    permissions: [
      'storage',
    ],
    content_scripts: [
      {
        matches: [
          'https://github.com/*',
        ],
        js: [
          'dist/contentScripts/index.global.js',
        ],
      },
    ],
    web_accessible_resources: [
      {
        resources: ['dist/contentScripts/style.css'],
        matches: ['https://github.com/*'],
      },
    ],
    content_security_policy: {
      extension_pages: isDev
        // this is required on dev for Vite script to load
        ? `script-src \'self\' http://localhost:${port}; object-src \'self\'`
        : 'script-src \'self\'; object-src \'self\'',
    },
  }

  // Firefox MV3 requires an explicit add-on ID; it also keys AMO updates.
  // data_collection_permissions (required by AMO; nothing is collected)
  // exists since Firefox 140 / Android 142, hence the minimum versions.
  // The property is not in webextension-polyfill types yet: loose typing.
  if (isFirefox) {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'comark-webext@comark.dev',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
      gecko_android: {
        strict_min_version: '142.0',
      },
    } as Manifest.WebExtensionManifest['browser_specific_settings']
  }

  return manifest
}
