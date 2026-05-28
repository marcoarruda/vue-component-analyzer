<template>
  <div class="shell">
    <section v-if="isSidebar" class="hero panel">
      <div>
        <div class="eyebrow">Workspace Graph</div>
        <h1>{{ graph.workspaceName }}</h1>
        <p class="subtitle">Vue and TypeScript files are rendered as nodes. Relative imports and requires are shown as directional edges.</p>
      </div>
      <div class="stats">
        <article class="stat-card">
          <div class="stat-label">Files</div>
          <div class="stat-value">{{ graph.stats.fileCount }}</div>
        </article>
        <article class="stat-card stat-card--vue">
          <div class="stat-label">Vue</div>
          <div class="stat-value">{{ graph.stats.vueFileCount }}</div>
        </article>
        <article class="stat-card stat-card--ts">
          <div class="stat-label">TypeScript</div>
          <div class="stat-value">{{ graph.stats.tsFileCount }}</div>
        </article>
        <article class="stat-card stat-card--edge">
          <div class="stat-label">Edges</div>
          <div class="stat-value">{{ graph.stats.edgeCount }}</div>
        </article>
      </div>
    </section>

    <GraphCanvas
      v-if="isPanel"
      :visible-nodes="visibleNodes"
      :visible-edges="visibleEdges"
      :connected-edges-by-node-id="connectedEdgesByNodeId"
      :all-edges="graph.edges"
      :selected-node-id="selectedNodeId"
      :filters="filters"
      @select-node="selectNode"
      @deselect-node="deselectNode"
      @open-file="openFile"
    />

    <LegendPanel v-if="isPanel" />

    <ControlsPanel
      v-if="isPanel"
      :filters="filters"
      :folder-names="folderNames"
      @update-filter="updateFilter"
      @toggle-folder="toggleFolder"
      @set-all-folders="setAllFolders"
    />

    <StatsPanel v-if="isPanel" :stats="graph.stats" />

    <section v-if="isSidebar" class="panel graph-launch-panel">
      <button class="graph-launch-button" type="button" @click="openGraphPanel">Open Full Project Graph</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue';
import ControlsPanel from './components/ControlsPanel.vue';
import GraphCanvas from './components/GraphCanvas.vue';
import LegendPanel from './components/LegendPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import { computeVisibleGraph, collectComponentSubfolders } from './composables/useGraphFilters';
import type { ProjectGraphResult, FilterState } from './types';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const EMPTY_GRAPH: ProjectGraphResult = {
  workspaceName: '',
  nodes: [],
  edges: [],
  stats: { fileCount: 0, vueFileCount: 0, tsFileCount: 0, storeFileCount: 0, serviceFileCount: 0, viewFileCount: 0, componentFileCount: 0, routerFileCount: 0, edgeCount: 0 },
};

const graph = ref<ProjectGraphResult>(EMPTY_GRAPH);
const selectedNodeId = ref<string | null>(null);

const filters = reactive<FilterState>({
  hideIsolated: true,
  showTests: false,
  showStories: false,
  showAppEntries: true,
  showRouter: true,
  showServices: false,
  showStores: false,
  showComposableTs: false,
  showViewComponents: true,
  showLabels: true,
  showFolderPaths: false,
  componentFolders: new Map(),
});

const DEFAULT_FILTERS: Omit<FilterState, 'componentFolders'> = {
  hideIsolated: true,
  showTests: false,
  showStories: false,
  showAppEntries: true,
  showRouter: true,
  showServices: false,
  showStores: false,
  showComposableTs: false,
  showViewComponents: true,
  showLabels: true,
  showFolderPaths: false,
};

const folderNames = computed(() => collectComponentSubfolders(graph.value.nodes));

const visibleGraph = computed(() =>
  computeVisibleGraph(graph.value.nodes, graph.value.edges, filters, selectedNodeId.value)
);
const visibleNodes = computed(() => visibleGraph.value.visibleNodes);
const visibleEdges = computed(() => visibleGraph.value.visibleEdges);
const connectedEdgesByNodeId = computed(() => visibleGraph.value.connectedEdgesByNodeId);

function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
  (filters as Record<string, unknown>)[key as string] = value;
}

function toggleFolder(name: string, checked: boolean) {
  filters.componentFolders.set(name, checked);
}

function setAllFolders(checked: boolean) {
  for (const key of filters.componentFolders.keys()) {
    filters.componentFolders.set(key, checked);
  }
}

function selectNode(nodeId: string) {
  selectedNodeId.value = nodeId;
  // Show all filters when focusing a node
  for (const key of Object.keys(DEFAULT_FILTERS) as Array<keyof typeof DEFAULT_FILTERS>) {
    (filters as Record<string, unknown>)[key] = true;
  }
  for (const key of filters.componentFolders.keys()) {
    filters.componentFolders.set(key, true);
  }
}

function deselectNode() {
  selectedNodeId.value = null;
  for (const key of Object.keys(DEFAULT_FILTERS) as Array<keyof typeof DEFAULT_FILTERS>) {
    (filters as Record<string, unknown>)[key] = DEFAULT_FILTERS[key];
  }
  for (const key of filters.componentFolders.keys()) {
    filters.componentFolders.set(key, false);
  }
}

function openFile(nodeId: string) {
  vscode?.postMessage({ type: 'openFile', path: nodeId });
}

function openGraphPanel() {
  vscode?.postMessage({ type: 'openGraphPanel' });
}

// panel or sidebar
const isSidebar = ref(true)
const isPanel = computed(() => !isSidebar.value);

onMounted(() => {
  // get body class name to determine if we're in sidebar or panel context
  isSidebar.value = document.body.classList.contains('graph-layout--sidebar');

  // Get the graph data from the hidden element and parse it
  const el = document.getElementById('graph-payload');
  if (!el) return;
  try {
    const parsed = JSON.parse(el.textContent ?? '{}') as ProjectGraphResult;
    graph.value = parsed;
    // Initialize component folder filter state
    for (const name of collectComponentSubfolders(parsed.nodes)) {
      filters.componentFolders.set(name, false);
    }
  } catch {
    // keep empty graph
  }
});
</script>
