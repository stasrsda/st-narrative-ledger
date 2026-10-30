// 注入槽位（薄适配层）
export const PROMPT_KEY = 'StoryLedger_State';
export const PROMPT_KEY_ADDR = 'StoryLedger_Address';

function c() {
    return globalThis.SillyTavern?.getContext?.() ?? {};
}

/** 写状态块。position：IN_CHAT，depth 1 */
export function setStatePrompt(text, { depth = 1, key = PROMPT_KEY } = {}) {
    const api = c();
    if (typeof api.setExtensionPrompt !== 'function') return false;
    const IN_CHAT = api.extension_prompt_types?.IN_CHAT ?? 1;
    const SYSTEM = api.extension_prompt_roles?.SYSTEM ?? 0;
    api.setExtensionPrompt(key, text ?? '', IN_CHAT, depth, false, SYSTEM);
    return true;
}

export function clearStatePrompt(key = PROMPT_KEY) {
    return setStatePrompt('', { key });
}

/** 兜底：直接写全局槽位（老版本没有 setExtensionPrompt 时） */
export function setRawSlot(text, { key = PROMPT_KEY } = {}) {
    const api = c();
    const slots = api.extension_prompts;
    if (!slots) return false;
    slots[key] = { value: text ?? '', position: 1, depth: 1, role: 0 };
    return true;
}
