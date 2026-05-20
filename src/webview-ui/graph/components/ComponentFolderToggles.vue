<template>
  <div v-if="folderNames.length > 0" class="controls-section">
    <div class="controls-section__header">
      <div class="controls-section__title">Component Folders</div>
      <div class="controls-section__toggles">
        <button class="toggle-all-btn" type="button" @click="$emit('set-all', true)">All</button>
        /
        <button class="toggle-all-btn" type="button" @click="$emit('set-all', false)">None</button>
      </div>
    </div>
    <div class="toggle-group">
      <label
        v-for="name in folderNames"
        :key="name"
        class="toggle"
      >
        <input
          type="checkbox"
          :checked="folderState.get(name) !== false"
          @change="$emit('toggle-folder', name, ($event.target as HTMLInputElement).checked)"
        />
        <span>Show components/{{ name }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  folderNames: string[];
  folderState: Map<string, boolean>;
}>();

defineEmits<{
  'toggle-folder': [name: string, checked: boolean];
  'set-all': [checked: boolean];
}>();
</script>
