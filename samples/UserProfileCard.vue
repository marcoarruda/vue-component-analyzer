<script setup lang="ts">
import { computed, inject, provide, ref, watch } from 'vue';

interface UserProfileProps {
  userId: string;
  dense?: boolean;
}

const props = defineProps<UserProfileProps>();
const emit = defineEmits<{
  (event: 'refresh'): void;
  (event: 'select'): void;
}>();
const displayMode = defineModel<'compact' | 'full'>('displayMode');

const profileTheme = inject('profileTheme', 'emerald');
const profileStore = useProfileStore();
const name = ref('Ada Lovelace');
const isBusy = ref(false);
const status = computed(() => `${name.value} is active in ${displayMode.value} mode`);

provide('profileContext', {
  id: props.userId,
  theme: profileTheme
});

watch(name, () => {
  profileStore.logView();
});

function refreshProfile() {
  isBusy.value = true;
  name.value = 'Grace Hopper';
  emit('refresh');
  isBusy.value = false;
}

function selectProfile() {
  emit('select');
}

defineExpose({
  refreshProfile,
  selectProfile
});

function useProfileStore() {
  return {
    logView() {
      return true;
    }
  };
}
</script>

<template>
  <article class="card">
    <h1>{{ name }}</h1>
    <p>{{ status }}</p>
    <p>Theme: {{ profileTheme }}</p>
    <button type="button" @click="refreshProfile">Refresh</button>
    <button type="button" @click="selectProfile">Select</button>

    <slot name="actions" :busy="isBusy" />
    <slot name="footer" :last-updated="status" />
  </article>
</template>

<style scoped>
.card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid #d0d7de;
  border-radius: 0.75rem;
}
</style>