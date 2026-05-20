<script setup lang="ts">
import { computed } from 'vue';

type FieldAs = 'input' | 'textarea';

interface Props {
  as?: FieldAs;
  modelValue?: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  type?: string;
  rows?: number;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'input',
  modelValue: '',
  disabled: false,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'input', value: Event): void;
  (event: 'change', value: Event): void;
}>();

const classes = computed(() => [
  'ui-field',
  props.as === 'textarea' ? 'ui-field--textarea' : '',
]);

function onInput(event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  emit('update:modelValue', target?.value ?? '');
  emit('input', event);
}

function onChange(event: Event) {
  emit('change', event);
}
</script>

<template>
  <component
    :is="props.as === 'textarea' ? 'textarea' : 'input'"
    :class="classes"
    :value="props.modelValue"
    :disabled="props.disabled"
    :placeholder="props.placeholder"
    :title="props.title"
    :type="props.as === 'textarea' ? undefined : props.type"
    :rows="props.as === 'textarea' ? props.rows : undefined"
    @input="onInput"
    @change="onChange"
  />
</template>
