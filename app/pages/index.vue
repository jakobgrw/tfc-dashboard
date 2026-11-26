<script setup lang="ts">
import { de } from '~/locales/de'
</script>

<template>
  <UContainer class="py-10">
    <h1 class="text-2xl font-semibold">
      {{ de.app.name }}
    </h1>
    <p class="text-muted">
      {{ de.app.tagline }}
    </p>
    <p class="mt-6">
      {{ de.home.empty }}
    </p>
  </UContainer>
</template>
