/**
 * Host-matched rangi themes for the full re-render.
 *
 * GitHub pages use rangi's own `github` light/dark pair (prettylights).
 * GitLab pages use a pair built from GitLab's default syntax themes, so
 * re-rendered fences match what GitLab's own highlighter would show:
 * - light: "White" (pygments-github style), from
 *   app/assets/stylesheets/highlight/_white_base.scss
 * - dark: "Dark" (Tomorrow Night), from
 *   app/assets/stylesheets/highlight/themes/dark.scss
 *
 * Users who picked another GitLab scheme (Monokai, Solarized, …) still get
 * these defaults. rangi themes are color-only, so GitLab's bold keywords and
 * operators stay regular weight.
 */
import type { ShjThemePair } from 'rangi'
import { github } from 'rangi/themes'

export const gitlab: ShjThemePair = {
  light: {
    name: 'gitlab-white',
    scheme: 'light',
    bg: '#ffffff',
    fg: '#333238',
    tokens: {
      kwd: '#000000', // .k
      oper: '#000000', // .o
      err: '#a61717', // .err
      deleted: '#aa0000', // .gr
      class: '#445588', // .nc
      cmnt: '#999988', // .c
      bracket: '#333238',
      num: '#009999', // .m
      bool: '#0086b3', // .nb
      type: '#445588', // .kt
      section: '#800080', // .gh
      var: '#008080', // .na / .nv
      str: '#dd1144', // .s
      esc: '#dd1144', // .se
      func: '#990000', // .nf
      insert: '#009926', // .sr green; .gi itself is background-based
    },
  },
  dark: {
    name: 'gitlab-dark',
    scheme: 'dark',
    bg: '#1d1f21',
    fg: '#c5c8c6',
    tokens: {
      kwd: '#b294bb', // $dark-k
      oper: '#8abeb7', // $dark-o
      err: '#cc6666', // $dark-err
      deleted: '#cc6666', // $dark-gd
      class: '#f0c674', // $dark-nc
      cmnt: '#969896', // $dark-c
      bracket: '#c5c8c6',
      num: '#de935f', // $dark-m
      bool: '#b294bb', // $dark-kc
      type: '#f0c674', // $dark-kt
      section: '#8abeb7', // $dark-gh
      var: '#81a2be', // $dark-na
      str: '#b5bd68', // $dark-s
      esc: '#de935f', // $dark-se
      func: '#81a2be', // $dark-nf
      insert: '#b5bd68', // $dark-gi
    },
  },
}

export function themeForHost(hostname: string): ShjThemePair {
  return hostname === 'gitlab.com' ? gitlab : github
}
