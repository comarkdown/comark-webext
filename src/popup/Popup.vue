<script setup lang="ts">
import { comarkEnabled } from '~/logic/storage'
</script>

<template>
  <main class="w-[300px] px-4 py-5 text-center text-gray-700">
    <Logo />
    <h1 class="mt-2 text-lg font-semibold">
      Comark for Git Hosting
    </h1>
    <p class="mt-1 text-sm opacity-60">
      Renders Comark components and attributes nicely on GitHub, GitLab, and other Git hosts.
    </p>

    <label class="mt-4 flex items-center justify-center gap-2 cursor-pointer select-none">
      <input
        v-model="comarkEnabled"
        type="checkbox"
        class="h-4 w-4 accent-teal-600"
      >
      <span>{{ comarkEnabled ? 'Enabled' : 'Disabled' }}</span>
    </label>

    <p class="mt-3 text-xs opacity-50">
      Toggling reloads open GitHub and GitLab tabs.
    </p>
  </main>
</template>
