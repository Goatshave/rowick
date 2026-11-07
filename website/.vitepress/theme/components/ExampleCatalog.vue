<script setup lang="ts">
import { withBase } from "vitepress";
import { exampleNavigation } from "./example-navigation";
</script>
<template>
  <div class="example-catalog">
    <a
      v-for="(example, index) in exampleNavigation"
      :key="example.id"
      :href="withBase(`/examples/${example.id}`)"
    >
      <span class="catalog-number">{{
        String(index + 1).padStart(2, "0")
      }}</span>
      <strong>{{ example.label }}</strong>
      <p>{{ example.description }}</p>
      <span class="catalog-open"
        >Open example <span aria-hidden="true">↗</span></span
      >
    </a>
  </div>
</template>
<style scoped>
.example-catalog {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 32px 0 48px;
}
.example-catalog > a {
  display: flex;
  flex-direction: column;
  align-items: start;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.example-catalog > a:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 6px 20px -12px #191c1f33;
}
.catalog-number {
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  margin-bottom: 24px;
}
.example-catalog strong {
  font-size: 18px;
  letter-spacing: -0.02em;
  font-weight: 600;
}
.example-catalog p {
  color: var(--vp-c-text-2);
  font-size: 14px;
  margin: 10px 0 24px;
  line-height: 1.65;
}
.catalog-open {
  margin-top: auto;
  font-size: 12px;
  color: var(--vp-c-brand-1);
}
@media (max-width: 850px) {
  .example-catalog {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 479px) {
  .example-catalog {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .example-catalog > a {
    padding: 20px;
  }
  .catalog-number {
    margin-bottom: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .example-catalog > a {
    transition: none;
  }
}
</style>
