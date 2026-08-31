<template>
  <SDialog :model-value="modelValue" :title="dialogTitle" @update:model-value="show = $event">
    <SFormItem :label="$t('fileManager.folderName')">
      <SInput
        ref="inputRef"
        v-model="name"
        :placeholder="$t('fileManager.folderNamePlaceholder')"
        @enter="doCreate"
      />
    </SFormItem>
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton @click="show = false">{{ $t("fileManager.cancel") }}</SButton>
        <SButton variant="primary" :loading="working" @click="doCreate">
          {{ $t("fileManager.create") }}
        </SButton>
      </div>
    </template>
  </SDialog>
</template>

<script setup lang="ts">
/**
 * Diálogo reutilizable de "crear carpeta" (lo usan el file manager y los
 * selectores de destino del planificador).
 *
 * - Enfoca el input al abrir: tras pulsar el botón "Añadir carpeta" se puede
 *   escribir el nombre y aceptar (Enter o Crear) sin tocar el ratón.
 * - Crea la carpeta dentro de `basePath` ("" = raíz) vía POST /api/files/mkdir
 *   y emite `created` con la ruta completa; el padre decide qué hacer con ella
 *   (p.ej. convertirla en el destino del mover/copiar o del root folder).
 */
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    /** Carpeta base donde crear ("" = raíz). Ruta del virtual FS ("home/..." o "downloads/..."). */
    basePath?: string;
    title?: string;
  }>(),
  { modelValue: false, basePath: "", title: "" },
);

const emit = defineEmits<{
  "update:modelValue": [val: boolean];
  /** Ruta completa de la carpeta creada (base + nombre). */
  created: [path: string];
}>();

const { apiFetch, showToast } = useApi();
const { t } = useI18n();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const dialogTitle = computed(() => props.title || t("fileManager.newFolder"));

const name = ref("");
const working = ref(false);
const inputRef = ref<{ $el: HTMLElement } | null>(null);

// Foco al input nada más abrir. El SDialog enfoca su overlay al abrirse; este
// watcher (del padre, corre después) captura el foco con el input.
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      name.value = "";
      nextTick(() => inputRef.value?.$el?.querySelector("input")?.focus());
    }
  },
);

async function doCreate() {
  const folder = name.value.trim();
  if (!folder) return;
  working.value = true;
  try {
    const base = (props.basePath ?? "").replace(/\/+$/, "");
    const path = base ? `${base}/${folder}` : folder;
    await apiFetch("/api/files/mkdir", { method: "POST", body: { path } });
    show.value = false;
    emit("created", path);
  } catch (err: any) {
    showToast(
      err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }),
      "error",
    );
  } finally {
    working.value = false;
  }
}
</script>