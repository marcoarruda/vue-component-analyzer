<script setup lang="ts">
import { onBeforeMount, onBeforeUnmount } from 'vue'
import type { ProjectGraphResult } from '../types'
import App from '../App.vue'

const props = defineProps<{
  data: ProjectGraphResult
  layout?: 'sidebar' | 'panel'
}>()

onBeforeMount(() => {
  const el = document.createElement('script')
  el.type = 'application/json'
  el.id = 'graph-payload'
  el.textContent = JSON.stringify(props.data)
  document.body.appendChild(el)

  if (props.layout === 'sidebar') {
    document.body.classList.add('graph-layout--sidebar')
  } else {
    document.body.classList.remove('graph-layout--sidebar')
  }
})

onBeforeUnmount(() => {
  document.getElementById('graph-payload')?.remove()
  document.body.classList.remove('graph-layout--sidebar')
})
</script>

<template>
  <App />
</template>
