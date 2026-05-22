<script setup lang="ts">
import { computed } from 'vue';

type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
});

const emit = defineEmits<{
  (event: 'click', value: MouseEvent): void;
}>();

const classes = computed(() => [
  'ui-button',
  `ui-button--${props.variant}`,
  `ui-button--${props.size}`,
]);
</script>

<template>
  <button
    :class="classes"
    :type="props.type"
    :disabled="props.disabled"
    :title="props.title"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
