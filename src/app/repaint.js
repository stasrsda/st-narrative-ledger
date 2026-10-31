// 定向重绘：只重排我们改过的那一条，绝不整页 printMessages
// （整页重绘会把其它扩展注入到消息上的按钮一起冲掉，见 docs/ARCHITECTURE.md §7）
export function createRepaint({ ctx, messages, lastMessageIndex, log }) {
    let timer = null;

    function repaintChat(targetIndex = null) {
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            try {
                const c = ctx();
                const full = targetIndex === -1;
                const idx = Number.isInteger(targetIndex) && targetIndex >= 0
                    ? targetIndex
                    : lastMessageIndex();
                const m = messages()?.[idx];
                if (full) {
                    c.printMessages?.();
                    return;
                }
                const node = document.querySelector(`#chat .mes[mesid="${idx}"] .mes_text`);
                if (m && node && typeof c.messageFormatting === 'function') {
                    node.innerHTML = c.messageFormatting(
                        m.mes ?? '', m.name ?? '', false, Boolean(m.is_user), idx,
                    );
                    return;
                }
                // 找不到那一条（比如正流式输出）：退回整页重绘
                if (typeof c.printMessages === 'function') {
                    c.printMessages();
                }
            } catch (e) {
                log('重绘失败', e?.message ?? e);
            }
        }, 400);
    }

    return { repaintChat };
}
