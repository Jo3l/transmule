<template>
  <SDialog :model-value="modelValue" :title="title" width="480px" @update:model-value="close">
    <!-- Slot por defecto: contenido extra sobre el picker (p.ej. hint del
         mover/copiar o campos auxiliares). Opcional. -->
    <slot />

    <FolderPicker
      :model-value="path"
      :key="'fp-dialog-' + pickerKey"
      @update:model-value="(v) => emit('update:path', v)"
    />

    <!-- Crear carpeta dentro de la seleccionada activa (mismo paso) -->
    <FolderCreateDialog
      v-model="showCreate"
      :base-path="path"
      @created="onCreated"
    />

    <template #footer>
      <div class="flex-end gap-sm">
        <SButton icon="mdi-folder-plus" @click="showCreate = true">
          {{ $t("fileManager.addFolder") }}
        </SButton>
        <SButton @click="close">{{ $t("fileManager.cancel") }}</SButton>
        <!-- Botón de confirmación por defecto ("Usar carpeta"); los
             consumidores con botón propio (p.ej. Mover/Copiar) usan el slot
             #confirm con la acción que quieran. -->
        <slot name="confirm">
          <SButton variant="primary" @click="confirm">
            {{ $t("planner.useFolder") }}
          </SButton>
        </slot>
      </div>
    </template>
  </SDialog>
</template>

<script setup lang="ts">
/**
 * Diálogo reutilizable de "elegir carpeta de destino", compartido por el file
 * manager (mover/copiar) y el planificador (root folder). En todos los sitios
 * el patrón es el mismo: FolderPicker + crear carpeta dentro de la carpeta
 * seleccionada + footer [Añadir carpeta] [Cancelar] [Confirmar].
 *
 * - v-model: visibilidad. v-model:path: ruta seleccionada (virtual FS).
 * - `select(path)` se emite al confirmar (slot #confirm por defecto); el
 *   componente se cierra solo. El consumidor mapea/normaliza la ruta si hace
 *   falta (p.ej. planner: "home/x" → "downloads/x").
 * - Slot por defecto = contenido extra sobre el picker; slot #confirm = botón
 *   de confirmación propio (se ignora `select` si se usa).
 * - Al crear una carpeta, la nueva pasa a ser `path` y el picker se re-monta
 *   para mostrarla visible + seleccionada.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    title?: string;
    /** Ruta seleccionada (jerga del virtual FS, igual que FolderPicker). */
    path?: string;
  }>(),
  { modelValue: false, title: "", path: "" },
);

const emit = defineEmits<{
  "update:modelValue": [val: boolean];
  "update:path": [val: string];
  /** Confirmado con la ruta seleccionada (solo con el botón por defecto). */
  select: [path: string];
}>();

/** Diálogo de crear carpeta dentro de la selección actual. */
const showCreate = ref(false);
/** Re-monta el FolderPicker tras crear para ver/seleccionar la carpeta nueva. */
const pickerKey = ref(0);

function close() {
  emit("update:modelValue", false);
}

function confirm() {
  emit("select", props.path);
  close();
}

function onCreated(createdPath: string) {
  emit("update:path", createdPath);
  pickerKey.value++;
}
</script>