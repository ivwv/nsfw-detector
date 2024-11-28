<script setup>
import NSFWDetector from "./components/NSFWDetector.vue";
</script>

<template>
  <div class="container">
    <NSFWDetector />
  </div>
</template>

<style>
.container {
  width: 100%;
  min-height: 100vh;
  margin: 0 auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
</style>
