// 礼法命中要过「场景门」：写在卧室的礼不该在城门口触发
/**
 * @param {object} code 礼法条目（有 when 数组）
 * @param {string|null} scene 当前场景类型（court/bedroom/street…）
 * @returns {boolean}
 */
export function codeAllowedAt(code, scene) {
    if (!code) return false;
    const when = Array.isArray(code.when) ? code.when : [];
    const sceneTokens = when
        .filter(x => typeof x === 'string' && x.startsWith('scene:'))
        .map(x => x.slice(6).trim())
        .filter(Boolean);
    // 没写场景约束 → 不拦
    if (!sceneTokens.length) return true;
    if (!scene) return true;          // 不知道场景时不拦（宁松不误杀）
    return sceneTokens.includes(scene);
}
