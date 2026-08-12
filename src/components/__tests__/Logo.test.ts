import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Logo from '../Logo.vue'

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: (path: string) => `chrome-extension://test-id/${path}`,
    },
  },
}))

describe('logo component', () => {
  it('should render the comark icon', () => {
    const wrapper = mount(Logo)

    expect(wrapper.get('img').attributes('src')).toBe('chrome-extension://test-id/assets/icon-512.png')
    expect(wrapper.get('a').attributes('href')).toBe('https://comark.dev')
  })
})
