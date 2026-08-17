<template>
  <div>
    <SFormItem
      v-for="field in fields"
      :key="field.name"
      :label="field.label"
    >
      <SSelect
        v-if="field.type === 'select'"
        :model-value="String(value(field))"
        @update:model-value="set(field, $event)"
      >
        <option
          v-for="(label, optValue) in field.options ?? {}"
          :key="optValue"
          :value="optValue"
        >
          {{ label }}
        </option>
      </SSelect>

      <SSwitch
        v-else-if="field.type === 'checkbox'"
        :model-value="!!value(field)"
        @update:model-value="set(field, $event)"
      />

      <p
        v-else-if="isInfo(field.type)"
        class="is-size-7 has-text-grey mb-0"
      >
        {{ stripHtml(String(value(field) ?? field.default ?? "")) }}
      </p>

      <SInput
        v-else
        :model-value="String(value(field) ?? '')"
        :type="inputType(field.type)"
        @update:model-value="set(field, $event)"
      />
    </SFormItem>
  </div>
</template>

<script setup lang="ts">
import type { PluginFieldSchema } from "~/composables/usePluginSettings";

const props = defineProps<{
  fields: PluginFieldSchema[];
  modelValue: Record<string, unknown>;
}>();

const emit = defineEmits<{
  "update:modelValue": [v: Record<string, unknown>];
}>();

function value(f: PluginFieldSchema): string | number | boolean {
  return (props.modelValue[f.name] ?? f.default ?? "") as
    | string
    | number
    | boolean;
}

function set(f: PluginFieldSchema, v: unknown) {
  emit("update:modelValue", { ...props.modelValue, [f.name]: v });
}

function isInfo(type: string): boolean {
  return type === "info" || type === "info_flaresolverr";
}

function inputType(
  type: string,
): "text" | "password" | "number" | "email" | "url" {
  if (type === "password") return "password";
  if (type === "number") return "number";
  if (type === "url") return "url";
  if (type === "email") return "email";
  return "text";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
</script>
