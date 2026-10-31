// 模型角色槽：一条流水线上有几个「工种」，每个工种可以换模型
// 设计原则：角色是固定的，模型是可换的；每个角色都有超时与降级
export const ROLE_DEFS = {
    planner: {
        label: '规划（编分镜）',
        why: '要把规则、人物卡、世界书揉成 3~5 个 beat',
        defaultModel: 'Qwen/Qwen2.5-14B-Instruct',
        maxTokens: 420,
        timeoutMs: 12000,
        critical: false,
    },
    deliberator: {
        label: '思辨（逻辑审校）',
        why: '审时间/在场/职权/忌，改 beats',
        defaultModel: '',                 // 空 = 继承 planner
        inherit: 'planner',
        maxTokens: 460,
        timeoutMs: 12000,
        critical: false,
    },
    settler: {
        label: '记账（好感/事件）',
        why: '只需分类与打分，越便宜越快越好',
        defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
        maxTokens: 400,
        timeoutMs: 10000,
        critical: false,
    },
    summarizer: {
        label: '摘要（可选）',
        why: '给小白X 或自建摘要用；不需要就留空',
        defaultModel: '',
        maxTokens: 300,
        timeoutMs: 15000,
        critical: false,
    },
};

/**
 * 解析某个角色该用哪套连接与模型。
 * 优先级：角色自定义 → 全局直连 → 连接配置
 * @returns {{role,label,via,baseUrl,apiKey,model,maxTokens,timeoutMs}|null}
 */
export function resolveRole(settings, roleId) {
    const def = ROLE_DEFS[roleId];
    if (!def) return null;

    const overrides = settings?.roles?.[roleId] ?? {};
    const direct = settings?.direct ?? {};
    const inherit = def.inherit ? (settings?.roles?.[def.inherit] ?? {}) : {};

    // 继承：自己没指定，就用父角色「解析后」的模型（不是父角色的原始覆盖）
    let inheritedModel = '';
    if (!overrides.model && def.inherit) {
        try {
            inheritedModel = resolveRole(settings, def.inherit)?.model ?? '';
        } catch { inheritedModel = ''; }
    }
    const model = String(
        overrides.model || inheritedModel || inherit.model || def.defaultModel || direct.model || '',
    ).trim();
    const baseUrl = String(overrides.baseUrl || inherit.baseUrl || direct.baseUrl || '').trim();
    const apiKey = String(overrides.apiKey || inherit.apiKey || direct.apiKey || '').trim();
    const maxTokens = Number(overrides.maxTokens ?? def.maxTokens ?? 400);
    const timeoutMs = Number(overrides.timeoutMs ?? def.timeoutMs ?? 12000);

    const viaDirect = Boolean(baseUrl && model && apiKey);
    const profileId = String(overrides.profileId || settings?.profileId || '').trim();

    if (!viaDirect && !profileId) return null;
    return {
        role: roleId,
        label: def.label,
        via: viaDirect ? 'direct' : 'profile',
        baseUrl, apiKey, model,
        maxTokens, timeoutMs,
        profileId,
    };
}

/** 给面板用：当前每个角色实际会落到哪个模型 */
export function describeRoles(settings) {
    return Object.entries(ROLE_DEFS).map(([id, def]) => {
        const r = resolveRole(settings, id);
        return {
            id,
            label: def.label,
            why: def.why,
            model: r?.model ?? (r?.via === 'profile' ? '（连接配置）' : '未配置'),
            via: r?.via ?? 'none',
            maxTokens: r?.maxTokens ?? def.maxTokens,
            timeoutMs: r?.timeoutMs ?? def.timeoutMs,
        };
    });
}

/** 带超时的执行：到点就放弃，绝不阻塞生成 */
export async function withTimeout(promise, ms, onTimeout) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(onTimeout ?? null), ms);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
