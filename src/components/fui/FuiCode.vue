<script
    lang="ts"
    setup
>
import { nextTick, onMounted, onUnmounted, ref, shallowRef, toRefs, watch } from 'vue';
import { VAceEditor } from 'vue3-ace-editor';
import { useSession } from '../../core/session';
import { debounce } from '../../utils';
import { aceMode, aceTheme } from './ace/ace-config';
const aceOptions = {
    fontSize: 12,
    showPrintMargin: false,
    showGutter: false,
    highlightActiveLine: true,
    tabSize: 4,
    useSoftTabs: true,
    wrap: true,
};

const props = defineProps<{
    readonly: boolean;
}>();

const session = useSession();
const { immidiateUpdates, selectionUpdates } = toRefs(session.state);
const content = shallowRef('');
const aceRef = shallowRef(null);
const hovered = ref(false);
const editorIsFocused = ref(false);
let editingTimer: ReturnType<typeof setTimeout> | null = null;
let isProgrammaticUpdate = false;

onMounted(() => {
    watch(immidiateUpdates, onUpdate, { immediate: true });
    if (!props.readonly) {
        nextTick(() => {
            const editor = aceRef.value?._editor;
            if (!editor) return;
            editor.on('change', onAceChange);
            editor.on('focus', () => { editorIsFocused.value = true; });
            editor.on('blur', () => {
                editorIsFocused.value = false;
                onUpdate();
            });
        });
    }
});

watch(
    selectionUpdates,
    () => {
        selectRow();
    },
    { deep: true }
);

function selectRow() {
    const { selected } = session.layersManager;
    if (selected.length == 1) {
        const layer = selected[0];
        const row = layersMap[layer.uid]?.line;
        if (row && aceRef.value?._editor) {
            const { column } = aceRef.value._editor.getCursorPosition() ?? { column: 0 };
            aceRef.value._editor.gotoLine(row + 1, column, true);
        }
    }
}

function onUpdate() {
    if (editorIsFocused.value) return;
    const sourceCode = session.generateCode();
    isProgrammaticUpdate = true;
    content.value = sourceCode.code ?? '';
    layersMap = sourceCode.map;
    nextTick(() => nextTick(() => { isProgrammaticUpdate = false; }));
    nextTick(() => {
        selectRow();
    });
}

onMounted(() => {
    onUpdate();
});

let layersMap = {};

function hasBalancedParens(code: string): boolean {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === stringChar) { inString = false; }
        } else if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
        } else if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            if (--depth < 0) return false;
        }
    }
    return depth === 0;
}

function onAceChange() {
    if (isProgrammaticUpdate) return;
    if (editingTimer) clearTimeout(editingTimer);
    editingTimer = setTimeout(async () => {
        const code = content.value;
        if (hasBalancedParens(code)) {
            await session.importCode(code, false);
        }
        editingTimer = null;
    }, 300);
}

function onCursorChange() {
    if (!aceRef.value?._editor) return;
    const { row } = aceRef.value._editor.getCursorPosition();
    const uid = Object.keys(layersMap).find((key) => layersMap[key].line === row);
    if (uid) {
        const layer = session.layersManager.getLayer(uid);
        session.layersManager.clearSelection();
        session.virtualScreen.redraw();
        session.layersManager.selectLayer(layer);
    }
}

const debouncedCursorChange = debounce(() => onCursorChange(), 500);

const rootRef = shallowRef<HTMLElement | null>(null);

function onPaste(e: ClipboardEvent) {
    if (!props.readonly) return;
    if (!rootRef.value?.contains(document.activeElement)) return;
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
        session.importCode(text, true);
    }
}

onMounted(() => {
    document.addEventListener('paste', onPaste);
});

onUnmounted(() => {
    document.removeEventListener('paste', onPaste);
    if (editingTimer) clearTimeout(editingTimer);
});
</script>
<template>
    <div
        ref="rootRef"
        class="fui-code"
        :class="{ readonly: props.readonly }"
        style="position: relative"
        @mouseenter.self="hovered = true"
        @mouseleave.self="hovered = false"
    >
        <VAceEditor
            ref="aceRef"
            v-model:value="content"
            :lang="aceMode"
            :theme="aceTheme"
            style="height: 100%; width: 100%; border-radius: 8px;"
            :options="aceOptions"
            :readonly="props.readonly"
            @click="onCursorChange"
            @keyup.up="debouncedCursorChange"
            @keyup.down="debouncedCursorChange"
        ></VAceEditor>
    </div>
</template>
<style lang="css">
.fui-code {
    height: 25vh;
    min-height: 200px;
    color: var(--secondary-color);
    text-transform: none;
    overflow: auto;
    white-space: pre;
}

.fui-code:focus {
    outline: none;
}

.fui-code pre {
    margin: 0;
}

.fui-code.readonly .ace_cursor {
    opacity: 0 !important;
}

.ace_scroller {
    padding: 8px;
}
</style>
