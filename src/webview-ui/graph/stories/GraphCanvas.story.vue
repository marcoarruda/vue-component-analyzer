<script setup lang="ts">
import '../graph.css'
import { computed } from 'vue'
import GraphCanvas from '../components/GraphCanvas.vue'
import type { ProjectGraphEdge, FilterState } from '../types'
import { mockSimpleGraph, mockMediumGraph } from './mockData'

function buildConnectedEdgesMap(edges: ProjectGraphEdge[]): Map<string, ProjectGraphEdge[]> {
  const map = new Map<string, ProjectGraphEdge[]>()
  for (const e of edges) {
    if (!map.has(e.source)) map.set(e.source, [])
    if (!map.has(e.target)) map.set(e.target, [])
    map.get(e.source)!.push(e)
    map.get(e.target)!.push(e)
  }
  return map
}

const defaultFilters: FilterState = {
  hideIsolated: false,
  showTests: false,
  showStories: true,
  showAppEntries: true,
  showRouter: true,
  showServices: true,
  showStores: true,
  showComposableTs: false,
  showViewComponents: true,
  showLabels: true,
  showFolderPaths: false,
  componentFolders: new Map(),
}

const simpleConnected = computed(() => buildConnectedEdgesMap(mockSimpleGraph.edges))
const medConnected = computed(() => buildConnectedEdgesMap(mockMediumGraph.edges))
</script>

<template>
  <Story title="Graph / GraphCanvas" :layout="{ type: 'single', iframe: false }">
    <Variant title="Simple (8 nodes)">
      <GraphCanvas
        :visible-nodes="mockSimpleGraph.nodes"
        :visible-edges="mockSimpleGraph.edges"
        :connected-edges-by-node-id="simpleConnected"
        :all-edges="mockSimpleGraph.edges"
        :selected-node-id="null"
        :filters="defaultFilters"
      />
    </Variant>

    <Variant title="Medium (20 nodes)">
      <GraphCanvas
        :visible-nodes="mockMediumGraph.nodes"
        :visible-edges="mockMediumGraph.edges"
        :connected-edges-by-node-id="medConnected"
        :all-edges="mockMediumGraph.edges"
        :selected-node-id="null"
        :filters="defaultFilters"
      />
    </Variant>
  </Story>
</template>
