<script setup lang="ts">
import '../graph.css'
import { reactive } from 'vue'
import ControlsPanel from '../components/ControlsPanel.vue'
import type { FilterState } from '../types'

const filters = reactive<FilterState>({
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
  componentFolders: new Map([['forms', false], ['shared', false]]),
})

function updateFilter(key: keyof FilterState, value: boolean) {
  if (key !== 'componentFolders') {
    (filters as Record<string, unknown>)[key] = value
  }
}
</script>

<template>
  <Story title="Graph / ControlsPanel">
    <Variant title="Default state">
      <div style="width: 260px; background: var(--vscode-sideBar-background, #1e1e1e);">
        <ControlsPanel
          :filters="filters"
          :folder-names="['forms', 'shared']"
          @update-filter="updateFilter"
          @toggle-folder="(name, checked) => filters.componentFolders.set(name, checked)"
          @set-all-folders="(checked) => filters.componentFolders.forEach((_, k) => filters.componentFolders.set(k, checked))"
        />
      </div>
    </Variant>
  </Story>
</template>
