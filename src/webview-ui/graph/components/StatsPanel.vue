<template>
  <section class="panel stats-panel">
    <div class="stats stats--expanded">
      <article class="stat-card">
        <div class="stat-label">Files</div>
        <div class="stat-value">{{ stats.fileCount }}</div>
      </article>
      <article class="stat-card stat-card--vue">
        <div class="stat-label">Vue</div>
        <div class="stat-value">{{ stats.vueFileCount }}</div>
      </article>
      <article class="stat-card stat-card--ts">
        <div class="stat-label">TypeScript</div>
        <div class="stat-value">{{ stats.tsFileCount }}</div>
      </article>
      <article class="stat-card stat-card--component">
        <div class="stat-label">Components</div>
        <div class="stat-value">{{ stats.componentFileCount }}</div>
      </article>
      <article class="stat-card stat-card--view">
        <div class="stat-label">Views</div>
        <div class="stat-value">{{ stats.viewFileCount }}</div>
      </article>
      <article class="stat-card stat-card--router">
        <div class="stat-label">Router</div>
        <div class="stat-value">{{ stats.routerFileCount }}</div>
      </article>
      <article class="stat-card stat-card--store">
        <div class="stat-label">Stores</div>
        <div class="stat-value">{{ stats.storeFileCount }}</div>
      </article>
      <article class="stat-card stat-card--service">
        <div class="stat-label">Services</div>
        <div class="stat-value">{{ stats.serviceFileCount }}</div>
      </article>
      <article class="stat-card stat-card--edge">
        <div class="stat-label">Edges</div>
        <div class="stat-value">{{ stats.edgeCount }}</div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ProjectGraphStats } from '../types';

defineProps<{
  stats: ProjectGraphStats;
}>();
</script>
