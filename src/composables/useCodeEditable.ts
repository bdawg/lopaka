import { ref, watch } from 'vue';

const STORAGE_KEY = 'lopaka_code_editable';
const codeEditable = ref(localStorage.getItem(STORAGE_KEY) !== 'false');

watch(codeEditable, (val) => {
    localStorage.setItem(STORAGE_KEY, String(val));
});

export function useCodeEditable() {
    return codeEditable;
}
