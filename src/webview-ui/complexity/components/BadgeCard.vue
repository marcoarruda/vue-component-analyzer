<template>
  <aside class="badge-card" aria-label="Analysis badge preview">
    <div class="badge-label">Badge</div>
    <img class="badge-image" :src="assetUri" :alt="`${label} badge`" />
    <div class="badge-value">{{ label }}</div>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  assetUri: string;
  label: string;
}>();
</script>
