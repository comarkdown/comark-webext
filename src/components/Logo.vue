<script setup lang="ts">
const iconUrl = browser.runtime.getURL('assets/icon-512.png')
</script>

<template>
  <a href="https://comark.dev" rel="noreferrer" target="_blank" title="Comark">
    <img :src="iconUrl" alt="Comark logo" class="mx-auto h-16 w-16">
  </a>
</template>
