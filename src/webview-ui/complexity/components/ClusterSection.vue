<template>
  <section :class="['cluster', nodeClass]" :data-node="nodeKey">
    <div class="cluster-title">{{ title }}</div>
    <div class="cluster-total">{{ total }}</div>
    <div class="metric-list">
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
  title: string;
  nodeKey: string;
  nodeClass: string;
  total: number;
  sections: Array<DetailSection & { label: string; detailId: string }>;
}>();

defineEmits<{
  'open-detail': [detailId: string];
}>();
</script>
