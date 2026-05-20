<template>
  <div class="zoom-controls zoom-controls--overlay" aria-label="Graph zoom controls">
    <button class="zoom-button" type="button" @click="$emit('zoom-out')">-</button>
    <button class="zoom-button zoom-button--reset" type="button" @click="$emit('fit')">Fit</button>
    <button class="zoom-button zoom-button--reset" type="button" @click="$emit('reset')">Reset</button>
    <button class="zoom-button" type="button" @click="$emit('zoom-in')">+</button>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  'zoom-out': [];
  'zoom-in': [];
  'fit': [];
  'reset': [];
}>();
</script>
