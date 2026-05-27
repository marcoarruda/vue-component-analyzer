<script setup lang="ts">
import '../graph.css'
import StatsPanel from '../components/StatsPanel.vue'
import { mockSimpleGraph, mockMediumGraph, mockLargeGraph } from './mockData'
</script>

<template>
  <Story title="Graph / StatsPanel">
    <Variant title="Simple">
      <StatsPanel :stats="mockSimpleGraph.stats" />
    </Variant>
    <Variant title="Medium">
      <StatsPanel :stats="mockMediumGraph.stats" />
    </Variant>
    <Variant title="Large">
      <StatsPanel :stats="mockLargeGraph.stats" />
    </Variant>
  </Story>
</template>
