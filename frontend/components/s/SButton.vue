<template>
  <button
    :class="classes"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span class="button-outline">
      <span class="button-shadow">
        <span class="button-inside">
          <span v-if="loading" class="s-btn__spinner" />
          <span class="button-text">
            <!-- label prop → per-character jump animation -->
            <span v-if="label" class="button-text-characters-container">
              <span
                v-for="(char, i) in labelChars"
                :key="i"
                class="button-text-character"
                :style="{ '--delay': `${i * 0.05}s` }"
                >{{ char === " " ? "\u00a0" : char }}</span
              >
            </span>
            <!-- slot → icons, formatted content, etc. -->
            <slot v-else />
          </span>
        </span>
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: "default" | "primary" | "success" | "warning" | "danger" | "info" | "text";
    size?: "sm" | "md" | "lg";
    /** Optional plain-text label. When provided each character gets a staggered jump animation on hover. */
    label?: string;
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    nativeType?: "button" | "submit" | "reset";
  }>(),
  {
    variant: "default",
    size: "md",
    nativeType: "button",
  },
);

defineEmits<{ click: [e: MouseEvent] }>();

const classes = computed(() => [
  "s-btn",
  props.variant !== "default" && `s-btn--${props.variant}`,
  props.size !== "md" && `s-btn--${props.size}`,
  props.block && "s-btn--block",
]);

const labelChars = computed(() => (props.label ? [...props.label] : []));
</script>
