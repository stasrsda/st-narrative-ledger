// 副模型传输（薄适配层）：用 ST 的连接配置，不自己管 key
export function transportAvailable() {
    const c = globalThis.SillyTavern?.getContext?.() ?? {};
    return typeof c.ConnectionManagerRequestService?.sendRequest === 'function';
}

/**
 * @param {Array<{role:string,content:string}>} messages
 * @param {{profileId?:string, maxTokens?:number}} o
 */
export async function requestCompletion(messages, { profileId = '', maxTokens = 320 } = {}) {
    const c = globalThis.SillyTavern?.getContext?.() ?? {};
    const svc = c.ConnectionManagerRequestService;
    if (!svc?.sendRequest) throw new Error('no-transport');
    if (!profileId) throw new Error('no-profile');
    const res = await svc.sendRequest(profileId, messages, maxTokens);
    return typeof res === 'string' ? res : (res?.content ?? '');
}
