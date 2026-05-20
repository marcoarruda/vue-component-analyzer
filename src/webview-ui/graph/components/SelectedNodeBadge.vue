<template>
  <div v-if="node" class="selected-node-badge">
    <span class="selected-node-badge__name">{{ node.path }}</span>
    <button
      class="selected-node-badge__deselect"
      type="button"
      aria-label="Deselect node"
      @click="$emit('deselect')"
    >✕</button>
  </div>
</template>

<script setup lang="ts">
import type { ProjectGraphNode } from '../types';

defineProps<{
  node: ProjectGraphNode | null;
}>();

defineEmits<{
  deselect: [];
}>();
</script>
