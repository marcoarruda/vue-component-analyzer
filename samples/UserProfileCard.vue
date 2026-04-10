<script setup lang="ts">
import { computed, ref } from 'vue';

const name = ref('Ada Lovelace');
const status = computed(() => `${name.value} is active`);

function refreshProfile() {
  name.value = 'Grace Hopper';
}
</script>

<template>
  <article class="card">
    <h1>{{ name }}</h1>
    <p>{{ status }}</p>
    <button type="button" @click="refreshProfile">Refresh</button>
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