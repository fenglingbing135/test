# AI 审核代码工作台

把一次合并请求（MR/PR）的代码变更交给 AI 审核，在本地 Web 工作台上得到**可定位、可分级的问题清单与改进建议**。单用户、免登录、本机运行，审核结论只在本工作台查看，不回写代码托管平台。

当前仓库已包含服务端完整能力与接口验收脚本；前端界面由后续任务交付，未构建前端时服务端仍可启动，非 `/api` 请求返回 404。

## 环境要求

- Node.js ≥ 20（服务端为 ESM JavaScript，免编译直接运行）
- 本机可写目录用于存放审核记录与平台凭证（默认 `./data`）

## 安装与运行

```bash
npm install          # 安装服务端与前端依赖
npm start            # 启动服务：http://127.0.0.1:8787（同时托管 dist/ 与 /api）
npm run dev:server   # 开发服务端，文件变更自动重启
npm run dev:web      # 开发前端（Vite，/api 代理到本机服务端）
npm run build        # 构建前端产物到 dist/
npm run verify       # API 级验收脚本：自启临时服务、独立数据目录、结束自动清理
```

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务监听端口 |
| `DATA_DIR` | `./data` | 数据目录，启动时自动创建 |
| `AI_BASE_URL` | — | OpenAI 兼容服务地址，例如 `https://api.openai.com/v1` |
| `AI_API_KEY` | — | 模型服务密钥（部署配置，不在界面配置） |
| `AI_MODEL` | — | 模型名 |
| `AI_TIMEOUT_MS` | `60000` | 模型调用超时 |
| `AI_JSON_MODE` | 开启 | 设为 `off` 时不发送 `response_format`（部分兼容服务不支持 JSON 模式） |
| `PLATFORM_TIMEOUT_MS` | `20000` | 平台拉取请求超时 |
| `REVIEW_ENGINE` | `live` | 设为 `stub` 启用确定性审核实现（仅验收使用） |
| `PLATFORM_FETCH_MODE` | `live` | 设为 `stub` 启用确定性平台拉取（仅验收使用） |
| `REVIEW_STEP_DELAY_MS` | 未设置 | 状态切换之间停留的毫秒数，用于观察「进行中」状态；不设置按正常速度执行 |

三个确定性开关只从服务端环境变量读取，界面上不暴露任何测试入口，默认值不改变产品行为。模型服务未配置时审核以失败结束并给出「审核服务未配置」，不会产生伪造结果。

## 数据与凭证

```text
data/
  settings.json          # 平台凭证（文件权限 0600），接口只回传末 4 位掩码
  reviews/<reviewId>/
    record.json          # 状态、来源、整体结论、问题清单、失败原因
    diff.patch           # 本次审核的变更内容原文
```

- 无数据库；删除记录即删除该目录，记录目录是审核结果的唯一权威。
- 每次写入先落同目录临时文件再原子重命名；同一记录的写操作按记录串行。
- 服务启动时把遗留的 `running` 记录标记为 `failed`（`INTERRUPTED`），不会留下永久进行中的记录。
- `data/` 为运行时产物，不提交业务数据文件。

## 接口

同源 `/api`，请求与响应均为 JSON（`DELETE` 成功返回 204 无正文），单用户本机应用不校验身份。字段级定义、错误码与状态迁移见 `docs/wi-t1000011/technical-contract.md`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET/PUT/DELETE | `/api/settings/platform` | 平台凭证的脱敏读取、保存、清除 |
| GET | `/api/reviews` | 记录列表（摘要投影，`status` / `limit` / `offset` 过滤分页） |
| POST | `/api/reviews` | 创建审核（粘贴变更或 MR 链接），返回 202 并异步审核 |
| GET | `/api/reviews/:reviewId` | 记录详情（状态、失败原因、整体结论、问题清单） |
| POST | `/api/reviews/:reviewId/retry` | 对同一记录重新发起审核（复用已保存的变更内容） |
| DELETE | `/api/reviews/:reviewId` | 删除记录 |

审核状态只由串行队列推进：`running → succeeded`（写入结论与问题清单）或 `running → failed`（写入失败原因）。链接模式的变更拉取在创建记录之前同步完成，失败直接返回错误码与可读原因，不产生空记录。

## 验收脚本

```bash
npm run verify
```

脚本在 `scripts/.verify-tmp/` 下创建独立临时数据目录、选择空闲端口自行启动与停止服务，结束后删除临时目录，不影响本机 `data/`。确定性开关让审核与拉取不访问外部服务，覆盖：

- 健康检查；
- 凭证保存、脱敏读取、清除与幂等清除；
- 粘贴模式创建 → 进行中 → 成功，问题清单字段、级别排序与 ID 顺序；
- 列表摘要投影、状态过滤与分页参数校验；
- 链接模式的凭证缺失、链接非法、主机不匹配、平台失败（401/403、404、网络）与成功拉取，且失败不产生记录；
- 进行中记录重试返回 409；
- 失败原因可见、同一记录重试后回到进行中并得出结论；
- 超出规模上限的记录以 `REVIEW_TOO_LARGE` 失败；
- 记录删除（含目录删除）与重复删除 404；
- 服务重启后中断记录恢复为 `INTERRUPTED` 并可重试；
- 无前端产物时非 `/api` 请求返回 404。

## 确定性实现（仅验收使用）

- `REVIEW_ENGINE=stub`：从 diff 解析文件与首个 hunk 行号，按文件顺序轮换高/中/低级别生成固定问题条目，不访问模型。
- 失败注入（写在变更内容里）：`lingee-stub-fail` 固定失败；`lingee-stub-fail-once` 首次失败、重试成功。
- `PLATFORM_FETCH_MODE=stub`：按链接返回固定 diff；仓库路径或链接包含 `unauthorized` / `forbidden` 返回 `PLATFORM_UNAUTHORIZED`，包含 `not-found` / `missing` 返回 `PLATFORM_NOT_FOUND`，包含 `network` / `timeout` / `unavailable` / `offline` 返回 `PLATFORM_UNAVAILABLE`。

## 残余风险

- 凭证以本机文件权限（0600）保护，未引入加密密钥管理；Windows 等不支持 POSIX 权限的文件系统上该保护有限。
- 真实平台（GitHub / GitLab 及自建实例）与真实模型服务调用未在本次验收中执行，仅验证了接口契约、错误码映射与确定性实现路径。
- 进程重启会中断正在执行的审核，已转为可见失败（`INTERRUPTED`）并支持重新发起。