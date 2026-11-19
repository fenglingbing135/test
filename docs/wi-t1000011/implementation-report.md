# 开发实现报告

- 工作项：`wi-t1000011`（AI 审核代码）
- 计划：`docs/wi-t1000011/development-task-plan.json`（`plan:81df26b4-843a-41b7-afbd-acdd7f91d799`）
- 上游基线：`docs/wi-t1000011/requirements.md`、`docs/wi-t1000011/architecture-baseline.md`、`docs/wi-t1000011/technical-contract.md`
- 执行结果：2 个实现任务全部完成（T01 → T02，按计划依赖顺序执行）

## 1. 任务与交付

| 任务 | 摘要 | 状态 | 主要交付 |
| --- | --- | --- | --- |
| T01 | 建立应用基础与服务端审核能力 | completed | `package.json`、`package-lock.json`、`src/server.js`、`src/server/`、`scripts/`、`README.md`、`.gitignore` |
| T02 | 实现审核工作台前端界面 | completed | `src/web/`、`index.html`、`vite.config.ts`、`tsconfig.json` |

### 1.1 服务端（T01）

按 `architecture-baseline.md` 第 2.1 节落地：`src/server/routes/`（审核记录与平台设置接口）、`src/server/store/`（目录型文件存储、原子写、脱敏读出）、`src/server/review/`（串行队列、引擎、模型客户端、确定性 stub 引擎、diff 归一化）、`src/server/platform/`（GitHub / GitLab 适配器与 stub 拉取）。接口字段、错误码与状态迁移遵循 `technical-contract.md`，未额外新增契约外字段或接口。

同时提供 `REVIEW_ENGINE=stub`、`PLATFORM_FETCH_MODE=stub`、`REVIEW_STEP_DELAY_MS` 三个仅由服务端环境变量读取的确定性开关，供后续验收阶段使用；默认配置保持 `live` 行为。前端产物缺失时服务端可正常启动，`/api` 之外的请求按 404 处理。

### 1.2 前端（T02）

按 `architecture-baseline.md` 第 1.3、2.2 节落地：应用壳（左侧导航 + 顶部上下文栏）、新建审核（粘贴 / MR 链接双模式）、审核历史列表与删除、记录详情（整体结论、问题清单、级别筛选、按文件聚合、重新发起）、平台设置页，以及状态标识、严重级别筛选器、问题卡片、代码片段块、空态与错误提示组件；`src/web/src/api/` 集中封装类型化调用与错误码文案映射。展示层筛选与聚合为派生状态，状态推进以服务端返回为准并以 1.5 秒间隔定时刷新、进入终态即停止。

## 2. 验证证据

| 检查 | 任务 | 结果 | 说明 |
| --- | --- | --- | --- |
| install-dependencies-and-lockfile | T01 | passed | `npm install --no-audit --no-fund` 退出码 0，生成锁文件 |
| syntax-check-server-and-scripts | T01 | passed | `node --check` 覆盖 `src/server.js`、`src/server/**`、`scripts/verify-api.mjs` |
| api-acceptance-verify | T01 | passed | `npm run verify` 退出码 0（当时尚无 `dist/`） |
| default-mode-live-review-without-ai-config | T01 | passed | 默认 `live` 模式未配置模型凭证时，审核以「服务未配置」失败而非伪造结果 |
| platform-adapters-and-engine-contract | T01 | passed | 适配器注册与引擎契约冒烟检查通过 |
| typecheck | T02 | passed | `npx tsc --noEmit` 退出码 0 |
| build | T02 | passed | `npm run build` 退出码 0，产物输出 `dist/` |
| spa-static-serving | T02 | passed | `/`、`/history/abc`、静态资源与 `/api/health` 均按预期返回 |
| form-validation-logic | T02 | passed | 14 项断言覆盖变更可识别性、GitHub/GitLab 链接解析、实例地址校验 |
| api-verify-suite/non-api-path-404-without-build | T02 | failed | 见第 3 节 |

`scripts/verify-api.mjs` 覆盖的接口场景：健康检查、凭证初始未配置 / 非法输入拒绝 / 保存脱敏 / 幂等清除、粘贴模式非法输入拒绝、粘贴审核 running → succeeded、列表投影、详情不存在、链接模式凭证缺失 / 链接非法 / 主机不匹配 / 平台失败映射 / 成功、重试冲突、失败可见且可重试、超大规模失败原因、删除记录、启动恢复中断记录。

## 3. 已知问题与残余风险

1. **`npm run verify` 在已构建工作区失败（未闭环）**：`scripts/verify-api.mjs` 的 `non-api-path-404-without-build` 用例断言「无前端产物时根路径返回 404」，该假设只在 `dist/` 不存在时成立。T01 执行时工作区尚无 `dist/`（通过），T02 构建后同一命令退出码 1。判定为两个任务对运行环境的集成假设不一致，非接口契约缺陷；修复点在 `scripts/verify-api.mjs`，需使其在没有/有前端产物两种状态下都成立（例如构建前清理或使用临时输出目录）。
2. **真实外部集成未验证**：真实代码托管平台调用与真实模型调用均以 stub 方式验证，凭证失效、平台 5xx、模型输出不可解析等真实分支未跑通；属于后续验收阶段的运行时验证范围。
3. **界面交互未做浏览器验证**：本次仅完成类型检查、构建与静态资源服务检查，页面交互、状态刷新、筛选与聚合的实际渲染效果未在浏览器中验收。
4. **架构已记录的残余风险沿用**：平台凭证依赖本机文件权限（0600）保护，未引入密钥管理；进程重启会中断进行中的审核，由启动恢复转为可见失败。

## 4. 验收标准对照

运行时与交互类证据由后续验证阶段产出；本阶段记录实现归属与当前结论。

| 验收标准 | 实现归属 | 当前结论 | 证据 |
| --- | --- | --- | --- |
| AC-01 粘贴变更内容可完成一次审核 | T01（创建、队列、结果写入）/ T02（输入与结果展示） | 已实现，运行时未验证 | `api-acceptance-verify` 中 `review-paste-running-then-succeeded`、`review-list-projection` 通过 |
| AC-02 通过 MR 链接拉取变更并审核 | T01（适配器、错误映射）/ T02（链接表单、凭证提示） | 已实现，运行时未验证 | `review-mrlink-*` 系列用例（凭证缺失、链接非法、主机不匹配、平台失败、成功）通过（stub 拉取） |
| AC-03 问题清单可定位、可分级、可筛选 | T01（排序与结论）/ T02（筛选、聚合、问题卡片） | 已实现，运行时未验证 | 服务端排序契约由用例覆盖；前端筛选与聚合仅有类型与构建证据 |
| AC-04 审核失败可见且可重试 | T01（失败原因、重试接口）/ T02（失败展示与重新发起） | 已实现，运行时未验证 | `review-failure-visible-and-retryable`、`review-retry-conflict-while-running`、`review-too-large-fails-with-reason` 通过 |
| AC-05 审核历史可回看与删除 | T01（列表投影、删除）/ T02（历史页、详情页） | 已实现，运行时未验证 | `review-delete-removes-record`、`review-list-projection` 通过 |
| AC-06 免登录直接使用 | T01（无认证的接口层） | 已实现，运行时未验证 | 接口层无身份校验；浏览器全流程未验证 |

## 5. 未完成事项

- 修复 `scripts/verify-api.mjs` 的 `non-api-path-404-without-build` 用例，使 `npm run verify` 在构建后仍可执行（见第 3 节第 1 条）。
- 真实平台与真实模型调用的连通性、限流与超时行为需在具备外部凭证的环境中另行验证。
- 浏览器端交互与视觉验收、移动端不在本版本范围。