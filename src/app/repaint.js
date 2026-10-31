// 定向重绘：只重排我们改过的那一条，绝不整页 printMessages
// 关键（来自 ST 1.19 源码调研）：
//   MESSAGE_RECEIVED 在 addOneMessage 之前触发 → 那时 DOM 还没有那条消息；
//   以前这里会「找不到就整页重绘」，正好把别的扩展注入的按钮冲掉。
//   现在改成排队 + 重试，等 CHARACTER_MESSAGE_RENDERED 或下一次轮询再刷。
export function createRepaint({ ctx, messages, lastMessageIndex, log }) {
    const pending = new Set();
    let timer = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 25;      // 25 × 120ms ≈ 3 秒
    const TICK = 120;

    function paintOne(idx) {
        const c = ctx();
        const m = messages()?.[idx];
        if (!m) return false;
        // 官方 API：只重建这一条（保留其它扩展绑在上面的按钮与监听器）
        if (typeof c.updateMessageBlock === 'function') {
            try {
                c.updateMessageBlock(idx, m);
                return true;
            } catch { /* 走下面的兜底 */ }
        }
        const node = document.querySelector(`#chat .mes[mesid="${idx}"] .mes_text`);
        if (node && typeof c.messageFormatting === 'function') {
            node.innerHTML = c.messageFormatting(
                m.mes ?? '', m.name ?? '', false, Boolean(m.is_user), idx,
            );
            return true;
        }
        return false;
    }

    function flush() {
        timer = null;
        if (!pending.size) return;
        for (const idx of [...pending]) {
            if (paintOne(idx)) pending.delete(idx);
        }
        if (!pending.size) {
            attempts = 0;
            return;
        }
        if (++attempts > MAX_ATTEMPTS) {
            log?.('重绘放弃（DOM 一直没就绪）：', [...pending].join(','));
            pending.clear();
            attempts = 0;
            return;
        }
        timer = setTimeout(flush, TICK);
    }

    /** 排队重绘某一条；-1 = 整页重绘（只在「清理全部历史」时用） */
    function repaintChat(targetIndex = null) {
        if (targetIndex === -1) {
            try {
                ctx().printMessages?.();
            } catch (e) {
                log?.('整页重绘失败', e?.message ?? e);
            }
            return;
        }
        const idx = Number.isInteger(targetIndex) && targetIndex >= 0
            ? targetIndex
            : lastMessageIndex();
        if (!Number.isInteger(idx) || idx < 0) return;
        pending.add(idx);
        if (!timer) timer = setTimeout(flush, 60);
    }

    /** 新消息渲染完成后，立刻把待刷的刷掉 */
    function flushNow() {
        attempts = 0;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        flush();
    }

    return { repaintChat, flushNow };
}
