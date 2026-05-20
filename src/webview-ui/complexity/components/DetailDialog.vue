<template>
  <dialog ref="dialogEl" class="details-dialog" :aria-labelledby="titleId">
    <div class="details-dialog__surface">
      <div class="details-dialog__header">
        <div>
          <div class="eyebrow">Component Details</div>
          <h2 :id="titleId">{{ section?.title ?? 'Details' }}</h2>
        </div>
        <button class="details-dialog__close" type="button" aria-label="Close details dialog" @click="close">Close</button>
      </div>
      <div class="details-dialog__body">
        <template v-if="section && section.items.length > 0">
          <ul class="detail-list">
            <li v-for="item in section.items" :key="item.name" class="detail-item">
              <span class="detail-name">{{ item.name }}</span>
              <span v-if="item.type" class="detail-type">{{ item.type }}</span>
            </li>
          </ul>
        </template>
        <p v-else-if="section" class="detail-empty">{{ section.emptyLabel }}</p>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { DetailSection } from '../types';

const titleId = 'details-dialog-title';
const dialogEl = ref<HTMLDialogElement | null>(null);

defineProps<{
  section: DetailSection | null;
}>();

function open() {
  dialogEl.value?.showModal();
}

function close() {
  dialogEl.value?.close();
}

onMounted(() => {
  dialogEl.value?.addEventListener('click', (event) => {
    if (event.target === dialogEl.value) {
      dialogEl.value?.close();
    }
  });
});

defineExpose({ open, close });
</script>
