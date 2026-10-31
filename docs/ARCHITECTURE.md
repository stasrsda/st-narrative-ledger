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

## 11. 平台事实（ST 1.19 源码调研，2026-10-30）

这些是踩过的坑与据此做的设计决定，改代码前先读这一节。

### 11.1 事件是「串行 await」的，但语义不一致

`emit` 是 async，逐个 `await` 监听器（`public/lib/eventemitter.js:146`），异常被吞、不中断。

| 事件 | 时机 | 是否 await |
|---|---|---|
| `GENERATION_AFTER_COMMANDS` | 生成前、提示词组装前 | ✅ 会被等 → **计划段可以在这里同步等副模型** |
| `MESSAGE_RECEIVED` | `saveReply` 里，**`addOneMessage` 之前** | ✅ |
| `CHARACTER_MESSAGE_RENDERED` | `addOneMessage` 之后，**DOM 已就绪** | ✅ |
| `GENERATION_ENDED` | 「停止按钮由可见变隐藏」时 | ❌ 不可靠，**我们不用它** |

因此：**重绘必须挂在 `CHARACTER_MESSAGE_RENDERED`**，不能挂在 `MESSAGE_RECEIVED`（那时 DOM 还没有这条消息）。

### 11.2 setExtensionPrompt 的参数陷阱

```js
setExtensionPrompt(key, value, position, depth, scan = false, role = SYSTEM, filter = null)
//                                        ↑ 第 5 位是 scan，不是 role（JSDoc 写错了）
```
- 同 key **覆盖**，不追加；`clearChat()` 会清空整个 `extension_prompts` → `CHAT_CHANGED` 后必须重注。
- 同 position/depth 的多条按 **key 字母序** 拼接 → 我们的 key 用 `StoryLedger_1_State` / `_2_Director` / `_3_Address` / `_4_Format` 控制顺序。
- Chat Completion 下，position 0/2 的注入会变成 Prompt Manager 里的条目，**用户能禁用/重排**——别依赖绝对位置。

### 11.3 getContext() 每次都是新对象

`chatMetadata`、`chatId`、`characterId`、`name1/2`、`mainApi` 都是**快照**；`chat_metadata` 会被整体重新赋值。
→ 规则：**永远现取**，不缓存 `ctx()` 或其字段（`chat` 数组除外，它是原地修改的引用）。

### 11.4 重绘只能用官方 API

`printMessages()` → `redisplayChat` 删除 `startIndex` 起所有 `.mes` 并重建，别的扩展注入的 DOM/监听器全丢。
→ 我们只用 `updateMessageBlock(idx, msg)`；`printMessages` 仅限「清理全部历史」。

### 11.5 消息结构（结算要对齐的地方）

```js
{ mes, is_user, swipe_id, swipes[], swipe_info[],
  extra: { api, model, reasoning, reasoning_duration, reasoning_signature, token_count } }
```
- 重新生成：**先删末条**（`MESSAGE_DELETED`）→ `GENERATION_AFTER_COMMANDS` → 新消息；
- swipe：不删消息，`coreChat.pop()` 后原地重渲染；
- `extra.reasoning` 回传受 **api + model 双重门控**，换模型后会被静默丢弃。

### 11.6 世界书的「当前挂载」没有单一 API

要合并 5 个来源：`selected_world_info`、`chat_metadata.world_info`、角色主书、`charLore[].extraBooks`、人设书。
`getContext().getWorldInfoNames()` 返回的是**磁盘上所有书名**，不是挂载列表——我们只把它当参考，不当依据。

### 11.7 调模型：两条路都留着

- 会话内：`generateRaw` / `generateQuietPrompt`（会走提示词组装，可能被预设污染）
- 独立请求：`ConnectionManagerRequestService.sendRequest(profileId, …)` 或 `/api/backends/chat-completions/generate`
- 我们走后者（`src/model/transport.js`），因为它不污染主对话、可用独立模型、可传 `max_tokens`。
- `custom_include_headers` 必须是 **YAML 字符串**（服务端 `yaml.parse`），传对象会被静默吞掉 → 401。

## 12. 小白X（LittleWhiteBox 3.2.3）事实与边界

### 12.1 数据在哪（我们曾经读错一层）

```
chat_metadata.extensions.LittleWhiteBox.storySummary = {
  json: { events[], facts[], characters{main[]}, arcs[], characterAliases[], keywords[] },
  lastSummarizedMesId, summaryHistory[], updatedAt, summaryInvalid?
}
```

**数据在 `.json` 里**；`storySummary` 本身只是容器。旧代码读 `storySummary.events` → 永远空。

字段语义（易错处）：

| 字段 | 真实语义 |
|---|---|
| `events[].summary` | 末尾**强制**带 `(#起始-结束)`，1-based 闭区间，读时剥掉 |
| `events[].memoryRole` | `状态变化/约定承诺/信息揭示/偏好习惯/具体经历`，可空 |
| `events[].participants[]` | 纯人名，禁代词 |
| `facts[].since` | **0-based** 楼层 |
| `facts[].trend` | 仅关系谓词（`^对(.+)的`）才有：`破裂/厌恶/反感/陌生/投缘/亲密/交融` |
| `characters` | **只有 `main`**；关系图是 facts 的投影，没有 `relationships` |
| `arcs[].progress` | **0..1 浮点** |
| `characterAliases[]` | `{from,to,evidence}`，有向图，命中后 LWB 自身已把 participants/s 归一 |
| `keywords[]` | `{text, weight}`，**每次总结整组替换** |

### 12.2 它注入了什么（会不会撞）

- 只写一个槽：`extension_prompts["LittleWhiteBox_StorySummary"]`，`IN_CHAT`，`depth = max(2, chatLen - boundary - 1)`，`role` 可配
- 包裹标签 `<剧情记忆>…</剧情记忆>`（**不是** `<world_state>`）
- 注册为 `generate_interceptor`，每轮生成前**先 delete 再写**，`STOPPED/切聊天/关闭` 时清除
- 不改写 `message.mes`；但会写 `message.is_system` 并 `saveChat()`

### 12.3 分工（结论）

| 谁 | 管什么 | 我们怎么用 |
|---|---|---|
| **小白X** | 长期记忆：事件时间线、SPO 事实、关系图、弧光、别名、向量召回 | **只读** `storySummary.json`；用它的事实/关系/弧光/别名 |
| **账本** | 此刻：时辰、地点、在场、礼法、好感、底单 | 写自己的 `chat_metadata.storyLedger`，**绝不碰** LWB 的三个 key |

### 12.4 必须避开（否则会互相破坏）

1. **不写** `chat_metadata.extensions.LittleWhiteBox.*`（它的提交是「整段 draft 覆盖 + 回读确认」，外部写入会触发 `metadata_save_conflict`，整段记忆会被判为不可消费）
2. **不在它提交窗口内抢写 metadata**：它的流程是 draft → saveMetadata → 回读服务器确认；我们改用自己的 key + `saveMetadataDebounced`
3. **不覆盖** `globalThis.xiaobaixGenerateInterceptor`（它多模块共享这一个入口）
4. **不依赖** `.mes_buttons` 里的按钮位置，也别碰 `.xiaobaix-sub-container`（它的折叠按钮会搬走子按钮）
5. **不复用** `LittleWhiteBox_StorySummary` 这个 prompt key，不注入 `<剧情记忆>`
6. **别指望 `<state>…</state>` 被它向量化**（整块删除），我们要让它索引，就不能用这个标签

### 12.5 已实现

`src/core/memory/lwb.js` 已按上述结构重写：`readLwbSummary` / `factsForCast` / `relationsFor` /
`arcsFor` / `eventsForCast` / `lwbAliases` / `aliasMapForActors` / `summarizedBoundary` / `lwbCast`。
测试 `test/b22-lwb.test.js`（11 条）按真实结构断言。
