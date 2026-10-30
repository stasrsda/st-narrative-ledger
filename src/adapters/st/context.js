// ST 上下文读写（薄适配层，非 ST 环境自动降级为空操作）
export function ctx() {
    return globalThis.SillyTavern?.getContext?.() ?? {};
}

export function chatId() {
    const c = ctx();
    return c.chatId ?? c.getCurrentChatId?.() ?? '';
}

export function messages() {
    const c = ctx();
    return Array.isArray(c.chat) ? c.chat : [];
}

export function lastMessageIndex() {
    return messages().length - 1;
}

/** chat_metadata.storyLedger */
export function readMeta() {
    const meta = ctx().chatMetadata;
    return meta?.storyLedger ?? null;
}

export function writeMeta(patch) {
    const c = ctx();
    const meta = c.chatMetadata;
    if (!meta) return false;
    meta.storyLedger = { ...(meta.storyLedger ?? {}), ...patch };
    try {
        c.saveMetadata?.();
    } catch {
        /* 交给上层忽略 */
    }
    return true;
}

/** 每条消息的事件数组 */
export function readEvents(msg) {
    return msg?.extra?.storyLedger?.events ?? [];
}

export function appendEvents(msg, events) {
    if (!msg || !events?.length) return false;
    msg.extra = msg.extra ?? {};
    msg.extra.storyLedger = msg.extra.storyLedger ?? {};
    const list = msg.extra.storyLedger.events ?? [];
    msg.extra.storyLedger.events = [...list, ...events];
    return true;
}

export function clearEvents(msg) {
    if (msg?.extra?.storyLedger) delete msg.extra.storyLedger.events;
}

/**
 * 全聊天的事件按楼层升序，供 fold 使用
 */
export function eventsByFloor() {
    return messages()
        .map((m, i) => ({ floor: i, events: readEvents(m) }))
        .filter(x => x.events.length);
}

/** 世界书名与角色名，用于解析世界包 */
export function packMatchNames() {
    const c = ctx();
    const worldBooks = [];
    try {
        const names = c.world_names ?? [];
        if (Array.isArray(names)) worldBooks.push(...names);
    } catch {
        /* noop */
    }
    const characters = [c.name2, c.characterId].filter(Boolean).map(String);
    return { worldBooks, characters };
}
