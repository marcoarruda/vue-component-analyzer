<script setup lang="ts">
import '../graph.css'
import GraphAppWrapper from './GraphAppWrapper.vue'
import { mockSimpleGraph, mockMediumGraph, mockLargeGraph } from './mockData'
</script>

<template>
  <Story title="Graph / App" :layout="{ type: 'single', iframe: false }">
    <Variant title="Simple (8 nodes)">
      <GraphAppWrapper :data="mockSimpleGraph" layout="panel" />
    </Variant>

    <Variant title="Medium (20 nodes)">
      <GraphAppWrapper :data="mockMediumGraph" layout="panel" />
    </Variant>

    <Variant title="Large (40+ nodes)">
      <GraphAppWrapper :data="mockLargeGraph" layout="panel" />
    </Variant>
  </Story>
</template>
