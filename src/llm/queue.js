// 串行队列 + 退避重试（不并发，避免和别的插件抢免费额度）
export function createQueue({ handler, retries = 3, backoff = [800, 2400, 6000], sleep = defaultSleep, onError } = {}) {
    const items = [];
    let running = false;

    async function runOne(task) {
        for (let i = 0; i <= retries; i++) {
            try {
                await handler(task);
                return true;
            } catch (error) {
                if (i === retries) {
                    try {
                        onError?.(error, task);
                    } catch {
                        /* noop */
                    }
                    return false;
                }
                await sleep(backoff[Math.min(i, backoff.length - 1)]);
            }
        }
        return false;
    }

    async function pump() {
        if (running) return;
        running = true;
        try {
            while (items.length) {
                const task = items.shift();
                await runOne(task);
            }
        } finally {
            running = false;
        }
    }

    return {
        push(task) {
            items.push(task);
            void pump();
            return items.length;
        },
        size: () => items.length,
        busy: () => running,
        /** 测试用：等队列排空 */
        async drain() {
            while (running || items.length) {
                await sleep(0);
            }
        },
    };
}

function defaultSleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
