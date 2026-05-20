<script setup lang="ts">
import { computed } from 'vue';

type SelectLayout = 'fit' | 'fluid';

interface SelectOption {
  label: string;
  value: string | number | boolean;
  title?: string;
  disabled?: boolean;
}

interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

type SelectItem = SelectOption | SelectOptionGroup;

interface Props {
  modelValue?: string | number | boolean;
  options: SelectItem[];
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
  `ui-select--${props.layout}`,
]);

function isSelectOptionGroup(item: SelectItem): item is SelectOptionGroup {
  return 'options' in item;
}

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
    <template v-for="item in props.options" :key="item.label">
      <optgroup v-if="isSelectOptionGroup(item)" :label="item.label">
        <option
          v-for="option in item.options"
          :key="String(option.value)"
          :value="option.value"
          :title="option.title ?? option.label"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </optgroup>
      <option
        v-else
        :value="item.value"
        :title="item.title ?? item.label"
        :disabled="item.disabled"
      >
        {{ item.label }}
      </option>
    </template>
  </select>
</template>
