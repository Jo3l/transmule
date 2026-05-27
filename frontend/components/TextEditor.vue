<template>
  <div
    ref="editorRef"
    class="te-root"
    contenteditable="true"
    spellcheck="false"
    @input="onInput"
    @keydown="onKeyDown"
    @focus="onFocus"
    @blur="onBlur"
  ></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";

const props = defineProps<{
  modelValue: string;
  syntax?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editorRef = ref<HTMLDivElement | null>(null);
let isUpdating = false;

// ── Syntax highlight ────────────────────────────────────────────────────────
function highlight(el: HTMLElement) {
  const text = el.innerText;
  // Wrap each line in a <div> for line numbering
  const lines = text.split("\n");
  el.innerHTML = lines
    .map((line) => {
      const highlighted = highlightLine(line);
      return `<div>${highlighted || " "}</div>`;
    })
    .join("");
}

function highlightLine(line: string): string {
  if (props.syntax === false) return line;
  return line
    // Comments (// ...)
    .replace(/(\/\/.*)/g, '<span class="te-comment">$1</span>')
    // Strings "..." '...' `...`
    .replace(/(&quot;(?:[^&]|&amp;|&lt;|&gt;)*&quot;|".*?"|'.*?'|`.*?`)/g, '<span class="te-string">$1</span>')
    // Keywords
    .replace(
      /\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b/g,
      '<span class="te-keyword">$1</span>',
    )
    // Numbers
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="te-number">$1</span>')
    // Python-style comments (# ...)
    .replace(/(#.*)/g, '<span class="te-comment">$1</span>');
}

// ── Caret position helpers ──────────────────────────────────────────────────
function getCaretPos(): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !editorRef.value) return 0;
  const range = sel.getRangeAt(0);
  const prefix = range.cloneRange();
  prefix.selectNodeContents(editorRef.value);
  prefix.setEnd(range.endContainer, range.endOffset);
  return prefix.toString().length;
}

function setCaretPos(pos: number) {
  const el = editorRef.value;
  if (!el) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ALL, null);
  let charCount = 0;
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent !== null) {
      const len = node.textContent.length;
      if (charCount + len >= pos) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(node, pos - charCount);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      charCount += len;
    }
  }
}

// ── Input handler: extract plain text, emit, re-highlight ──────────────────
function onInput() {
  if (isUpdating || !editorRef.value) return;
  const text = editorRef.value.innerText;
  // Remove trailing newlines that contenteditable adds
  const clean = text.replace(/\n+$/, "");
  emit("update:modelValue", clean);
  const pos = getCaretPos();
  highlight(editorRef.value);
  nextTick(() => setCaretPos(pos));
}

// ── Tab key → insert spaces ────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Tab") {
    e.preventDefault();
    const sel = window.getSelection();
    const range = sel?.getRangeAt(0);
    if (range) {
      range.deleteContents();
      range.insertNode(document.createTextNode("    "));
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    triggerUpdate();
  }
}

function triggerUpdate() {
  if (!editorRef.value) return;
  const clean = editorRef.value.innerText.replace(/\n+$/, "");
  emit("update:modelValue", clean);
  const pos = getCaretPos();
  highlight(editorRef.value);
  nextTick(() => setCaretPos(pos));
}

// ── Sync external model changes to editor ──────────────────────────────────
watch(
  () => props.modelValue,
  (val) => {
    if (!editorRef.value || isUpdating) return;
    const pos = getCaretPos();
    editorRef.value.innerText = val;
    highlight(editorRef.value);
    nextTick(() => setCaretPos(Math.min(pos, val.length)));
  },
);

function onFocus() {
  // Ensure content is rendered on focus
  if (editorRef.value && !editorRef.value.innerHTML) {
    highlight(editorRef.value);
  }
}

function onBlur() {
  // Trim on blur
  if (!editorRef.value) return;
  const clean = editorRef.value.innerText.replace(/\n+$/, "");
  if (clean !== props.modelValue) {
    emit("update:modelValue", clean);
  }
}

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerText = props.modelValue;
    highlight(editorRef.value);
  }
});
</script>

<style>
.te-root {
  font-family: "Courier New", Courier, monospace;
  font-size: 0.82rem;
  line-height: 1.55;
  outline: none;
  overflow: auto;
  padding: 0.75rem 0.75rem 0.75rem 3.2rem;
  min-height: 50vh;
  max-height: calc(80vh - 10rem);
  resize: vertical;
  background: var(--s-bg-input);
  color: var(--s-text);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  box-sizing: border-box;
  counter-reset: te-line;
  white-space: pre-wrap;
  word-wrap: break-word;
  transition: border-color 0.15s;
}
.te-root:focus {
  border-color: var(--s-accent);
}

/* Each line div — line number via CSS counter */
.te-root > div {
  counter-increment: te-line;
  position: relative;
  min-height: 1.2em;
}
.te-root > div::before {
  content: counter(te-line);
  position: absolute;
  right: calc(100% + 0.8rem);
  text-align: right;
  color: var(--s-text-muted);
  opacity: 0.5;
  font-size: 0.75rem;
  user-select: none;
  width: 2rem;
}

/* Syntax colors */
.te-keyword {
  color: var(--s-accent);
  font-weight: 600;
}
.te-string {
  color: var(--s-success, #2ecc71);
}
.te-comment {
  color: var(--s-text-muted);
  font-style: italic;
}
.te-number {
  color: var(--s-warning, #f0a329);
}
</style>
