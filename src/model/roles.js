// 模型角色槽：一条流水线上有几个「工种」，每个工种可以换模型
// 设计原则：角色固定、模型可换；超时给得宽松（硅基流动的 DS 通道本身就慢，
// 一轮一分钟是常态），但仍然要有上限，否则一次挂死会卡住整个生成。
export const ROLE_DEFS = {
    planner: {
        label: '规划（编分镜）',
        why: '要把规则、人物卡、世界书揉成 3~5 个 beat',
        defaultModel: 'Qwen/Qwen2.5-14B-Instruct',
        maxTokens: 420,
        timeoutMs: 180000,          // 3 分钟：够慢的通道也能跑完
        critical: false,
    },
    deliberator: {
        label: '思辨（逻辑审校）',
        why: '审时间/在场/职权/忌，改 beats',
        defaultModel: '',                 // 空 = 继承 planner
        inherit: 'planner',
        maxTokens: 460,
        timeoutMs: 180000,
        critical: false,
    },
    settler: {
        label: '记账（好感/事件）',
        why: '分类与打分，便宜快就够',
        defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
        maxTokens: 400,
        timeoutMs: 150000,
        critical: false,
    },
    summarizer: {
        label: '摘要（可选）',
        why: '给小白X 或自建摘要用；不需要就留空',
        defaultModel: '',
        maxTokens: 300,
        timeoutMs: 180000,
        critical: false,
    },
};

/**
 * 解析某个角色该用哪套连接与模型。
 * 优先级：角色自定义 → 继承角色 → 全局直连 → 连接配置
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
    const scale = Number(settings?.timeoutScale ?? 1) || 1;
    const timeoutMs = Math.round(Number(overrides.timeoutMs ?? def.timeoutMs ?? 180000) * scale);

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

/** 带超时的执行：到点就放弃，绝不永久阻塞生成 */
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

/** 最近几次各角色耗时（诊断用） */
const timings = new Map();
export function recordTiming(roleId, ms, ok = true) {
    const list = timings.get(roleId) ?? [];
    list.push({ ms, ok, at: Date.now() });
    while (list.length > 5) list.shift();
    timings.set(roleId, list);
}

export function timingReport() {
    const out = {};
    for (const [k, v] of timings) {
        const last = v[v.length - 1];
        out[k] = {
            lastMs: last?.ms ?? 0,
            ok: last?.ok ?? null,
            avgMs: Math.round(v.reduce((a, b) => a + b.ms, 0) / (v.length || 1)),
            n: v.length,
        };
    }
    return out;
}
