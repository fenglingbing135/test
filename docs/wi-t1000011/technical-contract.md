# 技术契约

本文件是字段级定义的唯一来源；`docs/wi-t1000011/architecture-baseline.md` 只保留接口摘要。

## 1. 通用约定

- 基址：同源 `/api`，请求与响应均为 `application/json; charset=utf-8`（`DELETE` 成功返回 204 无正文）。
- 认证：无。单用户本机应用，接口不校验身份；平台凭证只用于服务端对外拉取。
- 时间：ISO 8601 字符串，UTC，例如 `2026-11-19T08:12:30.000Z`。
- 错误响应统一形状：

```json
{ "error": { "code": "PLATFORM_UNAUTHORIZED", "message": "平台凭证无效或无权访问该合并请求" } }
```

- `message` 面向用户，可直接展示；`code` 供前端归类与测试断言。

## 2. ID 约定

| 标识 | 生成方 | 存储表示 | API JSON 类型 | 前端类型 | 校验与转换 |
| --- | --- | --- | --- | --- | --- |
| `reviewId` | 服务端（UUID v4 字符串） | 目录名与 `record.json#/id`，均为字符串，无自增数字主键 | `string` | `string` | 服务端在路由层校验 `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`，非法直接 404；前端原样透传，不做类型转换 |
| `findingId` | 服务端（记录内 `f1`、`f2`…按顺序生成） | `record.json#/findings[].id` 字符串 | `string` | `string` | 服务端生成，前端只读作列表 key；不跨记录复用 |
| 合并请求编号 | 从链接解析 | `record.json#/source/number` 数字 | `number` | `number` | GitHub 为 `number`，GitLab 为 `iid`；解析失败即链接非法 |

## 3. 枚举

| 枚举 | 取值 | 含义 |
| --- | --- | --- |
| `status` | `running` / `succeeded` / `failed` | 审核中 / 审核成功 / 审核失败 |
| `source.type` | `paste` / `mr-link` | 粘贴变更 / 合并请求链接 |
| `severity` | `high` / `medium` / `low` | 高 / 中 / 低（界面展示为中文） |
| `platform` | `github` / `gitlab` | 代码托管平台类型 |

## 4. 平台设置

### 4.1 `GET /api/settings/platform`

响应 200：

```ts
{
  configured: boolean;
  platform: "github" | "gitlab" | null;
  baseUrl: string | null;          // 例如 https://github.com 或自建实例地址
  tokenHint: string | null;        // 仅返回末 4 位掩码，如 "****a1b2"；未配置为 null
  updatedAt: string | null;
}
```

永不返回令牌原文。

### 4.2 `PUT /api/settings/platform`

请求：

```ts
{
  platform: "github" | "gitlab";
  baseUrl: string;                 // 必填，http/https 绝对地址，不得含路径查询参数
  token?: string;                  // 首次配置必填；省略表示保留现有令牌
}
```

- 校验失败返回 400 `INVALID_INPUT`，`message` 指明具体字段。
- `baseUrl` 规范化：去除末尾 `/` 与 `/api/v4`、`/api` 后缀，统一存根地址。
- 成功返回 200，正文同 4.1。

### 4.3 `DELETE /api/settings/platform`

成功 204；未配置时同样返回 204（幂等）。

## 5. 审核记录

### 5.1 记录详情形状（`GET /api/reviews/:reviewId`）

```ts
{
  id: string;
  status: "running" | "succeeded" | "failed";
  source: {
    type: "paste" | "mr-link";
    url: string | null;            // mr-link 时的原始链接
    platform: "github" | "gitlab" | null;
    repository: string | null;     // "owner/repo" 或 GitLab 完整路径
    number: number | null;
  };
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;                // ≥ 1，重新发起后递增
  changeSummary: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  conclusion: {                    // status = succeeded 时存在，否则为 null
    totalIssues: number;
    highSeverityCount: number;
  } | null;
  findings: Array<{                // status = succeeded 时存在，否则为 []
    id: string;
    file: string;                  // 仓库内相对路径
    location: string;              // 行号范围，如 "L42-L58"；无法确定时为空字符串
    snippet: string | null;        // 该问题对应的变更片段（可为 null）
    severity: "high" | "medium" | "low";
    message: string;               // 问题说明
    suggestion: string;            // 改进建议
  }>;
  failure: { code: string; message: string } | null;  // status = failed 时存在
}
```

`findings` 默认按严重级别 high → medium → low 排列，同级内按文件与行号升序；前端筛选与聚合为展示层派生，不改变服务端顺序。

### 5.2 `GET /api/reviews`

查询参数：`status`（可选，按枚举过滤）、`limit`（默认 50，上限 200）、`offset`（默认 0）。

响应 200：

```ts
{
  total: number;
  items: Array<{
    id: string;
    status: "running" | "succeeded" | "failed";
    sourceType: "paste" | "mr-link";
    sourceLabel: string;           // 粘贴：短摘要（首行文件名或"粘贴的变更"）；链接：仓库路径 + 合并请求编号
    createdAt: string;
    issueCount: number | null;     // 未成功时为 null
    highSeverityCount: number | null;
  }>;
}
```

按 `createdAt` 倒序。列表不返回 `findings` 与 diff 内容。

### 5.3 `POST /api/reviews`

请求（两种模式互斥）：

```ts
// 粘贴模式
{ "mode": "paste", "diffText": string }
// 链接模式
{ "mode": "mr-link", "url": string }
```

处理顺序与责任：

1. 校验模式与字段非空；粘贴模式要求 `diffText` 去空白后非空，且能被识别为代码变更（包含统一 diff 标记 `diff --git` / `@@` / `+++` / `---` 之一，或包含至少一行带 `;`、`{}`、`=`、`#`、`//`、`<` 等代码特征的文本）；链接模式要求可解析出平台、仓库与合并请求编号，且主机与已配置实例地址一致。失败返回 400（`INVALID_INPUT` / `INVALID_LINK` / `UNSUPPORTED_HOST`）。
2. 链接模式要求已配置凭证，未配置返回 400 `CREDENTIAL_MISSING`（提示前往设置）；随后同步拉取变更，失败按第 7 节映射返回，不创建记录。
3. 生成本次 `reviewId`，写入 `record.json`（`status: running`）与 `diff.patch`，将任务入队，返回 202 与记录详情（同 5.1，`status` 为 `running`，`findings` 为空数组）。

约束：

- 同一请求中的变更只产生一条记录；重复提交即新记录。
- 单次 diff 超过 400000 字符仍创建记录，但任务立即以 `REVIEW_TOO_LARGE` 失败，`failure.message` 说明超出可处理范围。

### 5.4 `POST /api/reviews/:reviewId/retry`

- 记录不存在返回 404 `NOT_FOUND`。
- 记录为 `running` 返回 409 `CONFLICT`，提示「审核进行中，请等待结果」。
- 其余情况：`attempts` 加 1，`status` 置为 `running`，清空 `conclusion`、`findings`、`failure` 与 `finishedAt`，重新入队，返回 202 与记录详情。
- 复用原有 `diff.patch`，不重新拉取平台变更。

### 5.5 `DELETE /api/reviews/:reviewId`

- 成功 204 并删除记录目录（含 diff）；不存在返回 404 `NOT_FOUND`。
- 运行中的记录允许删除；队列任务完成写入时发现记录已删除则丢弃结果，不重建目录。

## 6. 状态迁移与并发

```text
(创建) → running → succeeded
                 ↘ failed
failed | succeeded --retry--> running → succeeded | failed
```

- 只有队列能写 `succeeded` / `failed`；接口只能写 `running`（创建与重试）。
- 状态写入前先读记录校验 `status = running`，避免重复完成任务覆盖已重试的新一轮结果。
- 服务启动时将遗留 `running` 记录置为 `failed`，`failure.code = INTERRUPTED`，`message = "服务重启导致审核中断，可重新发起"`。
- 记录写入：同目录临时文件 + 原子重命名；同一记录的写操作串行。

## 7. 错误码

| code | HTTP | 触发条件 | 用户可见提示方向 |
| --- | --- | --- | --- |
| `INVALID_INPUT` | 400 | 字段缺失、格式错误、变更内容无法识别 | 指出需补充或修正的字段 |
| `INVALID_LINK` | 400 | MR 链接无法解析出仓库与合并请求编号 | 提示检查链接 |
| `UNSUPPORTED_HOST` | 400 | 链接主机与已配置实例地址不一致 | 提示链接与平台配置不匹配 |
| `CREDENTIAL_MISSING` | 400 | 链接模式未配置平台凭证 | 提示先完成平台凭证配置 |
| `PLATFORM_UNAUTHORIZED` | 502 | 平台返回 401/403 | 凭证无效或无权访问该合并请求 |
| `PLATFORM_NOT_FOUND` | 502 | 平台返回 404 | 合并请求不存在或无权访问 |
| `PLATFORM_UNAVAILABLE` | 502 | 网络错误、超时、平台 5xx | 平台暂时不可用，稍后重试 |
| `AI_NOT_CONFIGURED` | — | 未配置 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | 审核服务未配置，请联系部署者 |
| `AI_UNAVAILABLE` | — | 模型服务网络失败、超时、非 2xx | 审核服务暂时不可用，可重新发起 |
| `REVIEW_RESULT_INVALID` | — | 模型输出经一次修补重试后仍无法解析 | 审核结果无法解析，可重新发起 |
| `REVIEW_TOO_LARGE` | — | diff 超过 400000 字符 | 变更内容超出单次可处理范围 |
| `INTERRUPTED` | — | 服务重启时记录仍在运行 | 审核中断，可重新发起 |
| `NOT_FOUND` | 404 | 记录或接口资源不存在 | 记录不存在或已删除 |
| `CONFLICT` | 409 | 对进行中的记录发起重试 | 审核进行中，请等待结果 |
| `INTERNAL` | 500 | 未预期异常 | 操作失败，请重试 |

创建与重试接口返回的外部失败（第 2 步拉取失败）走 4xx/5xx 响应；审核执行阶段的失败写入记录 `failure`，接口本身已返回 202。

## 8. 前端与服务端责任边界

- 服务端负责：输入识别、链接解析、平台请求、diff 归一化、规模判定、模型调用与输出校验、状态与问题排序、凭证脱敏。
- 前端负责：字段级表单校验（与第 5.3 第 1 步同义，仅作即时反馈，服务端仍完整校验）、错误码到文案的映射、级别筛选与按文件聚合、进行中状态的定时刷新（1.5 秒间隔，记录进入终态后停止）。
- 任何展示字段缺失时前端按空态处理，不推断结论；不以本地缓存替代服务端状态。