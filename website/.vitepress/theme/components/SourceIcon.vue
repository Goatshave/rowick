<script setup lang="ts">
defineProps<{ kind: 'folder' | 'code' | 'style' | 'chevron' }>();
</script>
<template>
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.35"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      v-if="kind === 'folder'"
      d="M2.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h4l2 2h6.4c.7 0 1.3.6 1.3 1.3v8.4c0 .7-.6 1.3-1.3 1.3H3.8c-.7 0-1.3-.6-1.3-1.3V6.5Z"
    />
    <path v-else-if="kind === 'chevron'" d="m7.5 5 5 5-5 5" />
    <template v-else>
      <path d="M11.5 2.5h-7c-.6 0-1 .4-1 1v13c0 .6.4 1 1 1h11c.6 0 1-.4 1-1v-9l-5-5Z" />
      <path d="M11.5 2.5v5h5" />
      <path v-if="kind === 'code'" d="m7.5 10-2 2 2 2m5-4 2 2-2 2" />
      <path v-else d="M7 10h6M7 13h4" />
    </template>
  </svg>
</template>
