<script setup lang="ts">
import '../graph.css'
import { ref, computed } from 'vue'
import GraphCanvas from '../components/GraphCanvas.vue'
import type { FilterState } from '../types'
import { computeVisibleGraph } from '../composables/useGraphFilters'

import { website as case001 } from './mocks/case-001'
import { WebAppUI as case002 } from './mocks/case-002'
import { website as case003 } from './mocks/case-003'
import { vueconfWorkshop2026 as case004 } from './mocks/case-004'
import { cerebrumUi as case005 } from './mocks/case-005'

const filters = ref<FilterState>({
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
})

const graph001 = computed(() => computeVisibleGraph(case001.nodes, case001.edges, filters.value, null))
const graph002 = computed(() => computeVisibleGraph(case002.nodes, case002.edges, filters.value, null))
const graph003 = computed(() => computeVisibleGraph(case003.nodes, case003.edges, filters.value, null))
const graph004 = computed(() => computeVisibleGraph(case004.nodes, case004.edges, filters.value, null))
const graph005 = computed(() => computeVisibleGraph(case005.nodes, case005.edges, filters.value, null))
</script>

<template>
  <Story title="Graph / GraphCanvas" :layout="{ type: 'single', iframe: false }">
    <Variant title="Study Case 001 — Website">
      <GraphCanvas :visible-nodes="graph001.visibleNodes" :visible-edges="graph001.visibleEdges"
        :connected-edges-by-node-id="graph001.connectedEdgesByNodeId" :all-edges="case001.edges"
        :selected-node-id="null" :filters="filters" />
      <template #controls>
        <HstCheckbox v-model="filters.hideIsolated" title="Hide Isolated" />
        <HstCheckbox v-model="filters.showTests" title="Show Tests" />
        <HstCheckbox v-model="filters.showStories" title="Show Stories" />
        <HstCheckbox v-model="filters.showAppEntries" title="Show App Entries" />
        <HstCheckbox v-model="filters.showRouter" title="Show Router" />
        <HstCheckbox v-model="filters.showServices" title="Show Services" />
        <HstCheckbox v-model="filters.showStores" title="Show Stores" />
        <HstCheckbox v-model="filters.showComposableTs" title="Show Composables" />
        <HstCheckbox v-model="filters.showViewComponents" title="Show View Components" />
        <HstCheckbox v-model="filters.showLabels" title="Show Labels" />
        <HstCheckbox v-model="filters.showFolderPaths" title="Show Folder Paths" />
      </template>
    </Variant>

    <Variant title="Study Case 002 — WebAppUI">
      <GraphCanvas :visible-nodes="graph002.visibleNodes" :visible-edges="graph002.visibleEdges"
        :connected-edges-by-node-id="graph002.connectedEdgesByNodeId" :all-edges="case002.edges"
        :selected-node-id="null" :filters="filters" />
      <template #controls>
        <HstCheckbox v-model="filters.hideIsolated" title="Hide Isolated" />
        <HstCheckbox v-model="filters.showTests" title="Show Tests" />
        <HstCheckbox v-model="filters.showStories" title="Show Stories" />
        <HstCheckbox v-model="filters.showAppEntries" title="Show App Entries" />
        <HstCheckbox v-model="filters.showRouter" title="Show Router" />
        <HstCheckbox v-model="filters.showServices" title="Show Services" />
        <HstCheckbox v-model="filters.showStores" title="Show Stores" />
        <HstCheckbox v-model="filters.showComposableTs" title="Show Composables" />
        <HstCheckbox v-model="filters.showViewComponents" title="Show View Components" />
        <HstCheckbox v-model="filters.showLabels" title="Show Labels" />
        <HstCheckbox v-model="filters.showFolderPaths" title="Show Folder Paths" />
      </template>
    </Variant>

    <Variant title="Study Case 003 — Website (alt)">
      <GraphCanvas :visible-nodes="graph003.visibleNodes" :visible-edges="graph003.visibleEdges"
        :connected-edges-by-node-id="graph003.connectedEdgesByNodeId" :all-edges="case003.edges"
        :selected-node-id="null" :filters="filters" />
      <template #controls>
        <HstCheckbox v-model="filters.hideIsolated" title="Hide Isolated" />
        <HstCheckbox v-model="filters.showTests" title="Show Tests" />
        <HstCheckbox v-model="filters.showStories" title="Show Stories" />
        <HstCheckbox v-model="filters.showAppEntries" title="Show App Entries" />
        <HstCheckbox v-model="filters.showRouter" title="Show Router" />
        <HstCheckbox v-model="filters.showServices" title="Show Services" />
        <HstCheckbox v-model="filters.showStores" title="Show Stores" />
        <HstCheckbox v-model="filters.showComposableTs" title="Show Composables" />
        <HstCheckbox v-model="filters.showViewComponents" title="Show View Components" />
        <HstCheckbox v-model="filters.showLabels" title="Show Labels" />
        <HstCheckbox v-model="filters.showFolderPaths" title="Show Folder Paths" />
      </template>
    </Variant>

    <Variant title="Study Case 004 — VueConf Workshop 2026">
      <GraphCanvas :visible-nodes="graph004.visibleNodes" :visible-edges="graph004.visibleEdges"
        :connected-edges-by-node-id="graph004.connectedEdgesByNodeId" :all-edges="case004.edges"
        :selected-node-id="null" :filters="filters" />
      <template #controls>
        <HstCheckbox v-model="filters.hideIsolated" title="Hide Isolated" />
        <HstCheckbox v-model="filters.showTests" title="Show Tests" />
        <HstCheckbox v-model="filters.showStories" title="Show Stories" />
        <HstCheckbox v-model="filters.showAppEntries" title="Show App Entries" />
        <HstCheckbox v-model="filters.showRouter" title="Show Router" />
        <HstCheckbox v-model="filters.showServices" title="Show Services" />
        <HstCheckbox v-model="filters.showStores" title="Show Stores" />
        <HstCheckbox v-model="filters.showComposableTs" title="Show Composables" />
        <HstCheckbox v-model="filters.showViewComponents" title="Show View Components" />
        <HstCheckbox v-model="filters.showLabels" title="Show Labels" />
        <HstCheckbox v-model="filters.showFolderPaths" title="Show Folder Paths" />
      </template>
    </Variant>

    <Variant title="Study Case 005 — Cerebrum UI">
      <GraphCanvas :visible-nodes="graph005.visibleNodes" :visible-edges="graph005.visibleEdges"
        :connected-edges-by-node-id="graph005.connectedEdgesByNodeId" :all-edges="case005.edges"
        :selected-node-id="null" :filters="filters" />
      <template #controls>
        <HstCheckbox v-model="filters.hideIsolated" title="Hide Isolated" />
        <HstCheckbox v-model="filters.showTests" title="Show Tests" />
        <HstCheckbox v-model="filters.showStories" title="Show Stories" />
        <HstCheckbox v-model="filters.showAppEntries" title="Show App Entries" />
        <HstCheckbox v-model="filters.showRouter" title="Show Router" />
        <HstCheckbox v-model="filters.showServices" title="Show Services" />
        <HstCheckbox v-model="filters.showStores" title="Show Stores" />
        <HstCheckbox v-model="filters.showComposableTs" title="Show Composables" />
        <HstCheckbox v-model="filters.showViewComponents" title="Show View Components" />
        <HstCheckbox v-model="filters.showLabels" title="Show Labels" />
        <HstCheckbox v-model="filters.showFolderPaths" title="Show Folder Paths" />
      </template>
    </Variant>
  </Story>
</template>
