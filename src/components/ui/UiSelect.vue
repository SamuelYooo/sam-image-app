<script setup lang="ts">
import { computed } from 'vue';

type SelectLayout = 'fit' | 'fluid';

interface SelectOption {
  label: string;
  value: string | number | boolean;
  title?: string;
  disabled?: boolean;
}

interface Props {
  modelValue?: string | number | boolean;
  options: SelectOption[];
  layout?: SelectLayout;
  disabled?: boolean;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'fit',
  disabled: false,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'change', value: Event): void;
}>();

const classes = computed(() => [
  'ui-select',
  'ui-select--fit',
  'ui-select--fluid',
  `ui-select--${props.layout}`,
]);

function onChange(event: Event) {
  const target = event.target as HTMLSelectElement | null;
  emit('update:modelValue', target?.value ?? '');
  emit('change', event);
}
</script>

<template>
  <select
    :class="classes"
    :value="props.modelValue"
    :disabled="props.disabled"
    :title="props.title"
    @change="onChange"
  >
    <option
      v-for="option in props.options"
      :key="String(option.value)"
      :value="option.value"
      :title="option.title ?? option.label"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </option>
  </select>
</template>
