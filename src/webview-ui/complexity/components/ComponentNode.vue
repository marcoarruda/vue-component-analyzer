<template>
  <section class="component-node" data-node="component">
    <div class="node-title">Component</div>
    <h2>{{ name }}</h2>
    <div class="component-reactivity-label">Reactivity · {{ internalTotal }}</div>
    <div class="metric-list component-metrics">
      <MetricButton
        v-for="section in sections"
        :key="section.detailId"
        :label="section.label"
        :detail-id="section.detailId"
        :count="section.items.length"
        @open-detail="$emit('open-detail', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import MetricButton from './MetricButton.vue';
import type { DetailSection } from '../types';

defineProps<{
  name: string;
  internalTotal: number;
  sections: Array<DetailSection & { label: string; detailId: string }>;
}>();

defineEmits<{
  'open-detail': [detailId: string];
}>();
</script>
