<template>
  <section class="panel controls-panel">
    <!-- Graph section -->
    <div class="controls-section">
      <div class="controls-section__header">
        <div class="controls-section__title">Graph</div>
        <div class="controls-section__toggles">
          <button class="toggle-all-btn" type="button" @click="setGraphSection(true)">All</button>
          /
          <button class="toggle-all-btn" type="button" @click="setGraphSection(false)">None</button>
        </div>
      </div>
      <label class="toggle">
        <input type="checkbox" :checked="filters.hideIsolated" @change="update('hideIsolated', $event)" />
        <span>Hide isolated files</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showLabels" @change="update('showLabels', $event)" />
        <span>Show labels</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showFolderPaths" @change="update('showFolderPaths', $event)" />
        <span>Show folder paths</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showTests" @change="update('showTests', $event)" />
        <span>Show test files</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showStories" @change="update('showStories', $event)" />
        <span>Show Histoire and Storybook files</span>
      </label>
    </div>

    <!-- Architecture section -->
    <div class="controls-section">
      <div class="controls-section__header">
        <div class="controls-section__title">Architecture</div>
        <div class="controls-section__toggles">
          <button class="toggle-all-btn" type="button" @click="setArchSection(true)">All</button>
          /
          <button class="toggle-all-btn" type="button" @click="setArchSection(false)">None</button>
        </div>
      </div>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showAppEntries" @change="update('showAppEntries', $event)" />
        <span>Show app entry files</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showRouter" @change="update('showRouter', $event)" />
        <span>Show router</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showServices" @change="update('showServices', $event)" />
        <span>Show services</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showStores" @change="update('showStores', $event)" />
        <span>Show stores</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showComposableTs" @change="update('showComposableTs', $event)" />
        <span>Show composable TS files</span>
      </label>
      <label class="toggle">
        <input type="checkbox" :checked="filters.showViewComponents" @change="update('showViewComponents', $event)" />
        <span>Show view components</span>
      </label>
    </div>

    <!-- Folder toggles -->
    <ComponentFolderToggles
      :folder-names="folderNames"
      :folder-state="filters.componentFolders"
      @toggle-folder="(name, checked) => $emit('toggle-folder', name, checked)"
      @set-all="(checked) => $emit('set-all-folders', checked)"
    />
  </section>
</template>

<script setup lang="ts">
import ComponentFolderToggles from './ComponentFolderToggles.vue';
import type { FilterState } from '../types';

const props = defineProps<{
  filters: FilterState;
  folderNames: string[];
}>();

const emit = defineEmits<{
  'update-filter': [key: keyof FilterState, value: boolean];
  'toggle-folder': [name: string, checked: boolean];
  'set-all-folders': [checked: boolean];
  'set-graph-section': [checked: boolean];
  'set-arch-section': [checked: boolean];
}>();

function update(key: keyof FilterState, event: Event) {
  emit('update-filter', key, (event.target as HTMLInputElement).checked);
}

function setGraphSection(checked: boolean) {
  for (const key of ['hideIsolated', 'showLabels', 'showFolderPaths', 'showTests', 'showStories'] as const) {
    emit('update-filter', key, checked);
  }
}

function setArchSection(checked: boolean) {
  for (const key of ['showAppEntries', 'showRouter', 'showServices', 'showStores', 'showComposableTs', 'showViewComponents'] as const) {
    emit('update-filter', key, checked);
  }
}
</script>
