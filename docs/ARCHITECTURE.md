# 架构复审：从 AI 工作流重看「叙事账本」

> 状态：2026-10-31 · 插件 0.9.90 · 本文是重构依据，不是说明书（说明书见 README/DESIGN）

## 0. 一页结论

**这个项目的本质不是「状态栏插件」，而是一条 AI 工作流：**

```
玩家一句话
   ↓ ①我替你算（插件：规则引擎）
   ↓ ②我替你编（副模型：规划 + 思辨）
   ↓ ③你只管写（主模型：文风）
   ↓ ④我替你记账（副模型：结算 → 插件：状态）
```

**现在的代码是按「功能」堆的，不是按「这条流水线」分的。**
表现：`index.js` 2002 行，其中三个函数占了 800 行（`composeTurnPlan` 236 / `composeAndInject` 90 / `settleMessage` 470），
它们横跨「读状态 → 调模型 → 改消息 → 写事件 → 刷 UI」，任何一个 bug 都要在这 800 行里找。

**重构目标**：让 `index.js` 只做装配（≤150 行），流水线四段各自成模块，契约（JSON/注释格式）集中在 `contracts/`，
所有可测逻辑与 DOM/ST 交互分离。

## 1. 为什么难：三条看不见的耦合

| 耦合 | 现象 | 根因 |
|---|---|---|
| **时间耦合** | 时间头的顺序前后改了 6 次；底单从来没生成 | 「算时间」「注入」「改写消息」「校验」分散在 4 处，靠变量名隐式传 |
| **职责耦合** | 一次 `settleMessage` 同时做：拆思考 / 修时间头 / 判在场 / 记驻地 / 排队结算 / 重绘 | 没有「阶段」概念，错误互相掩盖 |
| **平台耦合** | 重绘整页会冲掉小白X 的按钮；`msg is not defined` 这类错只有 ST 里才炸 | 直接写 ST 全局，没有适配层边界，也没有在 ST 里的自动化验证 |

## 2. AI 工作流（重构的骨架）

### ① 感觉段（插件，纯规则，无模型）
- **输入**：玩家最新一句 + 当前状态
- **输出**：时间推进分钟数、地点变更、在场候选、礼法候选、可触发事件
- **失败**：不可能失败（纯函数）；任何异常 → 用默认值
- **代码归属**：`core/*`（clock/place/codes/presence）

### ② 计划段（副模型，可关）
- **输入**：感觉段结果 + 人物卡（忌/职权/状态）+ 世界书 2 条 + 最近三轮 + 底单
- **输出**（JSON，严格契约）：
  ```json
  {"minutes":0,"place":"","codes":[],"beats":[{"who":"","do":""}],
   "hook":"","situation":"","wants":[],"facts":[],"problems":[]}
  ```
- **二次思辨**：同一模型审自己的草稿（时间/在场/状态/职权/忌/因果/礼法）
- **失败降级**：解析失败 → 只保留感觉段结果；超时 8s → 同上；JSON 部分可用 → 逐字段校验后合并
- **代码归属**：`llm/turnPlan.js`、`llm/deliberate.js`（已存在），执行器归 `pipeline/planTurn.js`（待建）

### ③ 写作段（主模型，玩家的付费模型）
- **输入**：状态块（深度 1）+ 导演大纲（深度 2）+ 玩家原话
- **唯一硬约束**：正文第一行抄底单
- **插件不干预**：不改写正文、不删句子（除隐藏注释与残留标签）
- **代码归属**：`pipeline/inject.js`（待建，抽自 composeAndInject）

### ④ 记账段（副模型 + 插件）
- **输入**：正文 + 思考摘录 + 在场 + 礼法候选
- **输出**：好感 delta / 事件 / 礼法命中 / 状态注记
- **插件职责**：场景门、单轮上限、在逃门、驻地门、幂等
- **代码归属**：`pipeline/settleTurn.js`（待建，抽自 settleMessage）

## 3. 数据模型（三层，别混）

| 层 | 存放 | 谁写 | 生命周期 |
|---|---|---|---|
| **事件层**（真相） | `message.extra.storyLedger.events` | 插件（规划/结算/手动） | 永存，可回放 |
| **状态层**（派生） | 内存 fold(seed, events) | 插件 | 每轮重算，不落盘 |
| **元数据层**（指针） | `chat_metadata.storyLedger` | 插件 | 存 seed / onstage / 驻地覆盖 / 底单 / 注记 / 缓存 |

**铁律**：状态只能由事件推出；元数据只放指针与缓存，不放"事实"。

## 4. 目标目录结构

```
index.js                    装配：import + boot + 事件注册（≤150 行）
src/
  app/
    bootstrap.js            挂样式、菜单、FAB、面板
    events.js               EVENT 绑定 → 调 pipeline
    settings.js             settings（localStorage + extensionSettings）单一入口
    diagnostics.js          diagInfo / diagDump / panelBase / affView
    repaint.js              定向重绘（绝不整页 printMessages）
  pipeline/
    planTurn.js             ① + ②：感觉段 → 计划段 → 写事件
    inject.js               ③：组状态块 + 大纲 → setExtensionPrompt
    settleTurn.js           ④：拆思考 → 底单校验 → 在场 → 结算
    presence.js             在场四路合并（规则，可测）
  contracts/
    plan.schema.js          计划段 JSON 校验（单一真源）
    settle.schema.js        记账段 JSON 校验
    markers.js              隐藏注释协议（在场/新地/底单）解析与剥离
  model/
    transport.js            直连 / 连接配置 二选一（唯一出口）
    planner.js              提示词构造（brief）
    settler.js              提示词构造
  state/
    ledger.js               事件 → 状态
    tree.js / clock.js / …
  adapters/
    st/context.js, st/prompt.js, st/llm.js, st/dom.js
  ui/
    panel.js, style.css
```

**依赖方向**（单向，禁止回指）：
```
ui → app → pipeline → (core | model | state) → adapters/st
```

## 5. 迁移表（现有 → 目标）

| 现有（index.js 行） | 迁到 |
|---|---|
| `composeTurnPlan` 440–675 | `pipeline/planTurn.js` |
| `advanceFromUserInput` 397–438 | `pipeline/planTurn.js`（规则段） |
| `composeAndInject` 1050–1139 | `pipeline/inject.js` |
| `settleMessage` 1140–1609 | `pipeline/settleTurn.js` + `pipeline/presence.js` |
| `enqueueSettle` 1610–1631 | `pipeline/settleTurn.js` |
| `repaintChat` 771–802 | `app/repaint.js` |
| `diagInfo` / `diagDump` / `panelBase` / `affView` | `app/diagnostics.js` |
| `mountMenu` / `injectStyles` / `mountFab` / `setupSettings` / `boot` 1632–1990 | `app/bootstrap.js` + `app/events.js` |
| `composeModelOutline` 678–724 | **删除**（已被 composeTurnPlan 取代） |

## 6. 契约（唯一真源，代码里只许引用这里）

1. **计划段 JSON**：`minutes | place | codes | beats | hook | situation | wants | facts | problems`
2. **记账段 JSON**：`results | beats | codeHits | happened | knows`
3. **底单**：`『年号年月日 · 时辰刻 · 地名』`，写在正文第一行；插件只校验不重写
4. **隐藏注释**：`<!--在场:名字@地点、…-->`、`<!--新地:名字>上级-->`；解析后剥离
5. **状态块**：`[状态·只读·勿复述]` 开头，`与<info>冲突时以本块为准。` 结尾

## 7. 降级矩阵（任何一环挂了都必须能玩）

| 失败 | 降级 |
|---|---|
| 副模型连不上 / 超时 | 只用规则段；大纲退回模板 |
| 计划 JSON 不合格 | 逐字段校验，好的用、坏的丢；全坏则忽略 |
| 思辨失败 | 用草稿 |
| 主模型没抄底单 | 插件补上（记日志） |
| 主模型抄错 | 换回底单 |
| 思考未闭合 | 尽力切；切不开就当正文，不丢内容 |
| 结算失败 | 重试 2 次；仍失败则本楼不记账（不阻塞下一轮） |
| 事件层写坏 | `fold` 容错：未知事件跳过 |

## 8. 分阶段重构（每阶段都必须：lint 0 / tests 绿 / 在 ST 里手动验一轮）

- **P0（已完成）** 静态检查 + 定向重绘 + 契约文档（本文）
- **P1** 抽出 `app/repaint.js`、`app/diagnostics.js`（纯搬移，不改行为）
- **P2** 抽出 `pipeline/inject.js`（composeAndInject + 底单生成）
- **P3** 抽出 `pipeline/settleTurn.js`（470 行拆成 4 个子步骤：thinking / header / presence / settle）
- **P4** 抽出 `pipeline/planTurn.js`；删除 `composeModelOutline`
- **P5** `model/transport.js` 收口所有模型调用；`contracts/` 收口所有 schema

## 9. 测试策略

| 层 | 现状 | 目标 |
|---|---|---|
| 纯函数 | 368 个测试 ✅ | 保持 |
| 静态检查 | no-undef ✅ | 加 no-unused / 循环依赖检测 |
| 契约 | 部分 | `contracts/*.schema.js` 单测：坏 JSON 必须被拒 |
| 流水线 | 无 | 每个 pipeline 模块注入 fake 依赖（假 ctx / 假 transport），断言「调用顺序 + 产出事件」 |
| ST 集成 | 全靠手测 | 加一个「自检」按钮：跑一条假消息过完整流水线，输出每段耗时与结果 |

## 10. 与其它扩展的边界

| 扩展 | 它管 | 我们绝不管 |
|---|---|---|
| 小白X | 长期记忆（事件/事实/关系/弧光/别名）、向量检索 | 不写它的 `storySummary`；只读 |
| ST | 聊天、消息、提示词装配、模型调用转发 | 不整页重绘；不接管 setExtensionPrompt 以外的注入 |
| 账本（本插件） | **此刻**：时辰、地点、在场、礼法、好感、底单 | 不做长期摘要（借小白X） |
