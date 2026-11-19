# 验证报告

## 验证结论

blocked

## 阻塞原因

environment-unavailable

本轮浏览器自动化能力不可用：agent_browser 的 open / snapshot -i / verify site 连续返回 status=stale-connection、failure=blocked_environment，页面无法加载或读取，已按要求停止该项而不反复重试。应用服务本身可用（http://127.0.0.1:8899/api/health 返回 status=ok、reviewEngine=stub、platformFetchMode=stub，根路径 200 返回 HTML）。下一步需在可用的预览浏览器环境中重跑本阶段浏览器验收；当前报告保留 blocked 结论，不据此判定产品失败。

受影响检查: QA-01, QA-02, QA-03, QA-04, QA-05, QA-06

后续动作: 恢复环境后正式重开 QA。

## 摘要

独立验证 AI 审核代码工作台的六项验收标准（粘贴审核、MR 链接审核、问题清单可定位可筛选、失败可见可重试、历史回看与删除、免登录使用）。

变更行为：本轮未取得页面验收证据；服务端接口层由仓库自带脚本覆盖 18/19 项（stub 审核与 stub 平台拉取）。

非目标：
- 不验证真实模型与真实代码托管平台的连通性与限流
- 不评估移动端或窄屏布局
- 不评估非需求内的视觉偏好

## 验证环境

本机 macOS 桌面环境（内嵌预览浏览器不可用） Node v26.13.0；应用 ai-review-workbench 0.1.0，前端 vite build 产物由同一 Hono 进程托管；独立临时数据目录 /tmp/qa-wi-t1000011-run1/data，无历史记录与平台凭证；PID/端口 127.0.0.1:8899；REVIEW_ENGINE=stub、PLATFORM_FETCH_MODE=stub、REVIEW_STEP_DELAY_MS=1200

## 验证检查

| 检查项 | 类型 | 状态 | 证据 |
|---|---|---|---|
| QA-01 | browser-ui | blocked | 无法执行：本轮浏览器工具返回 status=stale-connection / failure=blocked_environment，open、snapshot -i、verify site 均在同一环境错误下失败，无法进入工作台执行粘贴提交或读取问题清单。服务端已按本轮配置启动（http://127.0.0.1:8899，REVIEW_ENGINE=stub，独立临时 DATA_DIR），但这不能替代页面验收证据。 |
| QA-02 | browser-ui | blocked | 无法执行：浏览器工具处于 blocked_environment，无法打开平台设置页完成凭证配置、以 MR 链接发起审核或观察失败提示。本轮仅确认接口层行为（npm run verify 中 review-mrlink-* 系列通过，使用 PLATFORM_FETCH_MODE=stub），属开发者测试证据，不构成页面验收。 |
| QA-03 | browser-ui | blocked | 无法执行：浏览器工具处于 blocked_environment，无法打开审核结果页验证级别筛选、按文件聚合与单条问题详情渲染。接口层排序契约由 npm run verify 的 review-paste-running-then-succeeded 覆盖，但未取得页面渲染或交互证据。 |
| QA-04 | browser-ui | blocked | 无法执行：浏览器工具处于 blocked_environment，无法在页面上制造失败记录、读取失败原因或点击重新发起。接口层失败与重试由 npm run verify 的 review-failure-visible-and-retryable、review-retry-conflict-while-running 覆盖，属开发者测试证据。 |
| QA-05 | browser-ui | blocked | 无法执行：浏览器工具处于 blocked_environment，无法在历史列表回看记录或执行删除。接口层列表投影与删除由 npm run verify 的 review-list-projection、review-delete-removes-record 覆盖，但未取得页面会话内回看与删除的交互证据。 |
| QA-06 | browser-ui | blocked | 无法执行：浏览器工具处于 blocked_environment，无法在全新工作台环境完成一次无需账号信息的完整流程。本轮服务以空临时 DATA_DIR 启动且接口层无身份校验（/api/health 正常返回），但未取得页面全流程证据，不能据此判定通过。 |

## 验收覆盖

| 验收项 | 结果 | 证据 |
|---|---|---|
| AC-01 | not-verified | QA-01 |
| AC-02 | not-verified | QA-02 |
| AC-03 | not-verified | QA-03 |
| AC-04 | not-verified | QA-04 |
| AC-05 | not-verified | QA-05 |
| AC-06 | not-verified | QA-06 |

## 缺陷

- —

## 未执行项

- —

## 剩余风险

- 真实代码托管平台调用与真实模型调用均未验证：本轮接口层使用 PLATFORM_FETCH_MODE=stub 与 REVIEW_ENGINE=stub，凭证失效、平台 5xx、模型输出不可解析等真实分支仍属未知。
- 仓库自带的接口验收脚本 npm run verify 在已构建前端（dist/ 存在）的工作区中固定失败一项：non-api-path-404-without-build 期望根路径 404，实际 200（本轮实测 18 项通过、1 项失败，退出码 1）。该用例把「无前端产物」当作前置条件但未在运行前保证，属测试资产假设问题而非已复现的产品行为缺陷，仍需实现方修正后才能在常规构建态下作为可重复验收证据。
- 页面视觉与布局（split-master-detail 工作台、状态标识、长清单定位）完全未目视验证，浏览器环境恢复后需重新执行。

<!-- structured-report:v1
{"decision":"blocked","summary":{"objective":"独立验证 AI 审核代码工作台的六项验收标准（粘贴审核、MR 链接审核、问题清单可定位可筛选、失败可见可重试、历史回看与删除、免登录使用）。","changedBehavior":"本轮未取得页面验收证据；服务端接口层由仓库自带脚本覆盖 18/19 项（stub 审核与 stub 平台拉取）。","nonGoals":["不验证真实模型与真实代码托管平台的连通性与限流","不评估移动端或窄屏布局","不评估非需求内的视觉偏好"],"riskLabels":["environment-unavailable","external-integration-unverified","test-asset-assumption"]},"environment":{"name":"本机 macOS 桌面环境（内嵌预览浏览器不可用）","version":"Node v26.13.0；应用 ai-review-workbench 0.1.0，前端 vite build 产物由同一 Hono 进程托管","dataProfile":"独立临时数据目录 /tmp/qa-wi-t1000011-run1/data，无历史记录与平台凭证；PID/端口 127.0.0.1:8899；REVIEW_ENGINE=stub、PLATFORM_FETCH_MODE=stub、REVIEW_STEP_DELAY_MS=1200"},"verification":[{"checkId":"QA-01","type":"browser-ui","status":"blocked","plan":[{"requirementId":"AC-01","kind":"runtime-render","action":"打开工作台，使用粘贴方式输入一段包含可识别问题的代码变更，确认发起审核。","expected":"审核进入进行中状态并最终变为成功，结果区展示与该变更对应的逐条问题条目。"},{"requirementId":"AC-01","kind":"interaction","action":"打开工作台，使用粘贴方式输入一段包含可识别问题的代码变更，确认发起审核。","expected":"审核进入进行中状态并最终变为成功，结果区展示与该变更对应的逐条问题条目。"}],"evidence":"无法执行：本轮浏览器工具返回 status=stale-connection / failure=blocked_environment，open、snapshot -i、verify site 均在同一环境错误下失败，无法进入工作台执行粘贴提交或读取问题清单。服务端已按本轮配置启动（http://127.0.0.1:8899，REVIEW_ENGINE=stub，独立临时 DATA_DIR），但这不能替代页面验收证据。","testStrategy":{"traits":["auto-clock","long-state-path"],"mode":"controlled","control":"服务端环境变量 REVIEW_ENGINE=stub 产生确定性问题条目，REVIEW_STEP_DELAY_MS=1200 让审核在 running 停留以便观察状态推进","reset":"使用本轮独立临时 DATA_DIR（/tmp 下），需要清空记录时停止并重新启动同一服务","maxAttempts":2}},{"checkId":"QA-02","type":"browser-ui","status":"blocked","plan":[{"requirementId":"AC-02","kind":"interaction","action":"先完成平台凭证配置，再以链接方式发起一次审核；随后在凭证失效或链接无效的条件下重复该操作。","expected":"正常情况下展示该合并请求变更的问题清单；异常情况下展示具体失败原因，且不出现空的或伪造的审核结果。"},{"requirementId":"AC-02","kind":"error-feedback","action":"先完成平台凭证配置，再以链接方式发起一次审核；随后在凭证失效或链接无效的条件下重复该操作。","expected":"正常情况下展示该合并请求变更的问题清单；异常情况下展示具体失败原因，且不出现空的或伪造的审核结果。"}],"evidence":"无法执行：浏览器工具处于 blocked_environment，无法打开平台设置页完成凭证配置、以 MR 链接发起审核或观察失败提示。本轮仅确认接口层行为（npm run verify 中 review-mrlink-* 系列通过，使用 PLATFORM_FETCH_MODE=stub），属开发者测试证据，不构成页面验收。","testStrategy":{"traits":["external-event","long-state-path"],"mode":"controlled","control":"服务端环境变量 PLATFORM_FETCH_MODE=stub 按 MR 链接仓库路径返回固定 diff 或 unauthorized/not-found/network 失败，REVIEW_ENGINE=stub 固定审核结果","reset":"使用本轮独立临时 DATA_DIR；凭证配置通过界面设置页保存或清除","maxAttempts":2}},{"checkId":"QA-03","type":"browser-ui","status":"blocked","plan":[{"requirementId":"AC-03","kind":"runtime-render","action":"打开一条包含多条不同级别问题的审核结果，切换严重级别筛选与按文件聚合视图，并查看单条问题详情。","expected":"筛选后仅显示对应级别问题；切换视图后问题按文件分组；单条问题可见完整的位置、级别、说明与建议。"},{"requirementId":"AC-03","kind":"interaction","action":"打开一条包含多条不同级别问题的审核结果，切换严重级别筛选与按文件聚合视图，并查看单条问题详情。","expected":"筛选后仅显示对应级别问题；切换视图后问题按文件分组；单条问题可见完整的位置、级别、说明与建议。"}],"evidence":"无法执行：浏览器工具处于 blocked_environment，无法打开审核结果页验证级别筛选、按文件聚合与单条问题详情渲染。接口层排序契约由 npm run verify 的 review-paste-running-then-succeeded 覆盖，但未取得页面渲染或交互证据。","testStrategy":{"traits":["auto-clock","long-state-path"],"mode":"controlled","control":"REVIEW_ENGINE=stub 按 diff 文件顺序生成高/中/低三级问题，REVIEW_STEP_DELAY_MS 控制状态推进节奏","reset":"使用本轮独立临时 DATA_DIR，复用已完成的 stub 审核记录","maxAttempts":2}},{"checkId":"QA-04","type":"browser-ui","status":"blocked","plan":[{"requirementId":"AC-04","kind":"interaction","action":"在一次审核以失败结束后，查看失败记录并执行重新发起审核。","expected":"失败原因可见，重新发起后记录状态回到进行中并可再次得出成功或失败结论，原有失败记录不被静默丢弃。"},{"requirementId":"AC-04","kind":"error-feedback","action":"在一次审核以失败结束后，查看失败记录并执行重新发起审核。","expected":"失败原因可见，重新发起后记录状态回到进行中并可再次得出成功或失败结论，原有失败记录不被静默丢弃。"}],"evidence":"无法执行：浏览器工具处于 blocked_environment，无法在页面上制造失败记录、读取失败原因或点击重新发起。接口层失败与重试由 npm run verify 的 review-failure-visible-and-retryable、review-retry-conflict-while-running 覆盖，属开发者测试证据。","testStrategy":{"traits":["auto-clock","long-state-path","external-event"],"mode":"controlled","control":"粘贴含 lingee-stub-fail-once 标记的变更，使 stub 引擎首次审核必定失败、重试成功；REVIEW_STEP_DELAY_MS 观察 running 状态","reset":"使用本轮独立临时 DATA_DIR；失败记录保留，重试复用同一记录","maxAttempts":2}},{"checkId":"QA-05","type":"browser-ui","status":"blocked","plan":[{"requirementId":"AC-05","kind":"session-persistence","action":"完成一次审核后返回历史列表，重新打开该记录，再删除它。","expected":"历史列表展示该记录的来源、时间、状态与问题数量；重新打开可见原结果；删除后列表中不再存在该记录。"},{"requirementId":"AC-05","kind":"interaction","action":"完成一次审核后返回历史列表，重新打开该记录，再删除它。","expected":"历史列表展示该记录的来源、时间、状态与问题数量；重新打开可见原结果；删除后列表中不再存在该记录。"}],"evidence":"无法执行：浏览器工具处于 blocked_environment，无法在历史列表回看记录或执行删除。接口层列表投影与删除由 npm run verify 的 review-list-projection、review-delete-removes-record 覆盖，但未取得页面会话内回看与删除的交互证据。","testStrategy":{"traits":["auto-clock","long-state-path"],"mode":"controlled","control":"REVIEW_ENGINE=stub 固定审核结果；记录持久化在服务端 DATA_DIR，浏览器重开后可回看","reset":"使用本轮独立临时 DATA_DIR；删除仅作用于本轮创建的记录","maxAttempts":2}},{"checkId":"QA-06","type":"browser-ui","status":"blocked","plan":[{"requirementId":"AC-06","kind":"runtime-render","action":"在全新环境首次打开工作台，直接执行粘贴变更并发起审核的流程。","expected":"流程全程无需任何账号信息，直接得到审核结果。"},{"requirementId":"AC-06","kind":"interaction","action":"在全新环境首次打开工作台，直接执行粘贴变更并发起审核的流程。","expected":"流程全程无需任何账号信息，直接得到审核结果。"}],"evidence":"无法执行：浏览器工具处于 blocked_environment，无法在全新工作台环境完成一次无需账号信息的完整流程。本轮服务以空临时 DATA_DIR 启动且接口层无身份校验（/api/health 正常返回），但未取得页面全流程证据，不能据此判定通过。","testStrategy":{"traits":["auto-clock","long-state-path"],"mode":"controlled","control":"以全新临时 DATA_DIR 启动服务（无任何记录、无凭证配置），REVIEW_ENGINE=stub 提供确定性审核结果","reset":"停止本轮服务并清空临时 DATA_DIR 后重新启动即为全新环境","maxAttempts":2}}],"coverage":{"acceptance":"AC-01: 在工作台粘贴合并请求的变更内容并确认发起后，系统完成审核并展示该变更对应的问题清单。; AC-02: 配置平台凭证后填写有效合并请求链接，系统拉取变更内容并产出审核结果；凭证缺失、失效或链接无法访问时明确指出失败原因且不产生结果。; AC-03: 清单中每条问题包含文件、位置、严重级别、问题说明与改进建议，可按严重级别筛选并按文件聚合查看。; AC-04: 审核失败时记录保留并展示失败原因，用户可对同一记录重新发起审核。; AC-05: 已完成的审核记录出现在历史列表并可重新打开查看完整结果；删除后该记录不再出现在列表中。; AC-06: 未登录状态下可直接使用审核功能，流程中不出现账号注册、登录或成员管理步骤。","mandatoryAcceptance":[{"id":"AC-01","source":"requirements.md#AC-01","surface":"user-interface","status":"not-verified","checkIds":["QA-01"],"evidenceKinds":["runtime-render","interaction"],"evidence":"QA-01 因浏览器环境不可用未能执行，无页面运行证据"},{"id":"AC-02","source":"requirements.md#AC-02","surface":"user-interface","status":"not-verified","checkIds":["QA-02"],"evidenceKinds":["interaction","error-feedback"],"evidence":"QA-02 因浏览器环境不可用未能执行，无页面交互与错误提示证据"},{"id":"AC-03","source":"requirements.md#AC-03","surface":"user-interface","status":"not-verified","checkIds":["QA-03"],"evidenceKinds":["runtime-render","interaction"],"evidence":"QA-03 因浏览器环境不可用未能执行，无筛选、聚合与问题详情渲染证据"},{"id":"AC-04","source":"requirements.md#AC-04","surface":"user-interface","status":"not-verified","checkIds":["QA-04"],"evidenceKinds":["interaction","error-feedback"],"evidence":"QA-04 因浏览器环境不可用未能执行，无失败展示与重试的页面证据"},{"id":"AC-05","source":"requirements.md#AC-05","surface":"user-interface","status":"not-verified","checkIds":["QA-05"],"evidenceKinds":["session-persistence","interaction"],"evidence":"QA-05 因浏览器环境不可用未能执行，无历史回看与删除的页面证据"},{"id":"AC-06","source":"requirements.md#AC-06","surface":"user-interface","status":"not-verified","checkIds":["QA-06"],"evidenceKinds":["runtime-render","interaction"],"evidence":"QA-06 因浏览器环境不可用未能执行，无免登录完整流程的页面证据"}],"riskLabels":[],"verificationTypes":["browser-ui"]},"defects":[],"skippedChecks":[],"residualRisks":["真实代码托管平台调用与真实模型调用均未验证：本轮接口层使用 PLATFORM_FETCH_MODE=stub 与 REVIEW_ENGINE=stub，凭证失效、平台 5xx、模型输出不可解析等真实分支仍属未知。","仓库自带的接口验收脚本 npm run verify 在已构建前端（dist/ 存在）的工作区中固定失败一项：non-api-path-404-without-build 期望根路径 404，实际 200（本轮实测 18 项通过、1 项失败，退出码 1）。该用例把「无前端产物」当作前置条件但未在运行前保证，属测试资产假设问题而非已复现的产品行为缺陷，仍需实现方修正后才能在常规构建态下作为可重复验收证据。","页面视觉与布局（split-master-detail 工作台、状态标识、长清单定位）完全未目视验证，浏览器环境恢复后需重新执行。"],"baselineUpdates":[],"testStrategyVersion":1,"blockedReason":{"code":"environment-unavailable","details":"本轮浏览器自动化能力不可用：agent_browser 的 open / snapshot -i / verify site 连续返回 status=stale-connection、failure=blocked_environment，页面无法加载或读取，已按要求停止该项而不反复重试。应用服务本身可用（http://127.0.0.1:8899/api/health 返回 status=ok、reviewEngine=stub、platformFetchMode=stub，根路径 200 返回 HTML）。下一步需在可用的预览浏览器环境中重跑本阶段浏览器验收；当前报告保留 blocked 结论，不据此判定产品失败。","checkIds":["QA-01","QA-02","QA-03","QA-04","QA-05","QA-06"]}}
-->
