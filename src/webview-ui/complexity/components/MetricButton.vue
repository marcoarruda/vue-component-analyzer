<template>
  <button
    class="metric metric-button"
    type="button"
    :data-detail-id="detailId"
    :disabled="count === 0"
    :aria-disabled="count === 0"
    @click="$emit('open-detail', detailId)"
  >
    <span class="metric-name">{{ label }}</span>
    <span class="metric-value">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  detailId: string;
  count: number;
}>();

defineEmits<{
  'open-detail': [detailId: string];
}>();
</script>
