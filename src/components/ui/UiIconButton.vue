<script setup lang="ts">
import { computed } from 'vue';

type IconButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  type: 'button',
  disabled: false,
});

const emit = defineEmits<{
  (event: 'click', value: MouseEvent): void;
}>();

const classes = computed(() => [
  'ui-icon-button',
  `ui-icon-button--${props.variant}`,
  `ui-icon-button--${props.size}`,
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
