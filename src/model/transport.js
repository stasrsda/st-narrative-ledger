// 单一出口：所有模型调用都从这里过（直连优先，其次连接配置），带超时
import { requestCustom, requestCompletion, transportAvailable } from '../adapters/st/llm.js';

/**
 * 按角色调用一次模型
 * @param {object} settings 插件设置
 * @param {string} roleId planner / deliberator / settler / summarizer
 * @param {Array<{role,content}>} messages
 * @param {{resolveRole, withTimeout, log}} deps 依赖注入，方便测试
 * @returns {Promise<{ok:boolean, text:string, via?:string, model?:string, ms:number, error?:string}>}
 */
export async function callRole(settings, roleId, messages, deps) {
    const { resolveRole, withTimeout, log, recordTiming } = deps;
    const role = resolveRole(settings, roleId);
    const t0 = Date.now();
    if (!role) {
        return { ok: false, text: '', ms: 0, error: `角色 ${roleId} 未配置` };
    }
    if (role.via !== 'direct' && !transportAvailable()) {
        return { ok: false, text: '', ms: 0, error: '没有可用的传输通道' };
    }

    const run = role.via === 'direct'
        ? requestCustom({
            baseUrl: role.baseUrl,
            apiKey: role.apiKey,
            model: role.model,
            messages,
            maxTokens: role.maxTokens,
        })
        : requestCompletion(messages, {
            profileId: role.profileId,
            maxTokens: role.maxTokens,
        });

    const res = await withTimeout(
        run.then(t => ({ timeout: false, t })).catch(e => ({ timeout: false, err: e })),
        role.timeoutMs,
        { timeout: true },
    );

    const ms = Date.now() - t0;
    if (!res || res.timeout) {
        log?.(`[${role.label}] 超时 ${ms}ms`);
        recordTiming?.(roleId, ms, false);
        return { ok: false, text: '', via: role.via, model: role.model, ms, error: 'timeout' };
    }
    if (res.err) {
        log?.(`[${role.label}] 失败`, res.err?.message ?? res.err);
        return { ok: false, text: '', via: role.via, model: role.model, ms, error: String(res.err?.message ?? res.err) };
    }
    recordTiming?.(roleId, ms, true);
    return { ok: true, text: String(res.t ?? ''), via: role.via, model: role.model, ms };
}
