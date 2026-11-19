import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

/**
 * API 级验收脚本：使用独立临时 DATA_DIR 与空闲端口自启自清服务，
 * 覆盖健康检查、凭证保存/脱敏读取/清除、粘贴创建并推进到成功、链接模式失败原因且不产生记录、
 * 失败重试、记录删除与启动时中断记录恢复。
 *
 * 仅在服务端使用确定性实现（REVIEW_ENGINE=stub、PLATFORM_FETCH_MODE=stub），不访问真实平台与模型。
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runRoot = path.join(projectRoot, 'scripts', '.verify-tmp', `run-${Date.now()}-${process.pid}`);
const dataDir = path.join(runRoot, 'data');
const steps = [];
let serverProcess = null;
let serverLogs = '';
let baseUrl = '';
let port = 0;

const token = 'ghp_verifyTokenA1b2';

function record(checkId, fn) {
  return { checkId, fn };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} 期望 ${b}，实际 ${a}`);
}

async function api(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text, headers: response.headers };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const found = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(found));
    });
  });
}

function captureLogs(chunk) {
  serverLogs += chunk.toString();
  if (serverLogs.length > 20000) serverLogs = serverLogs.slice(-20000);
}

async function startServer() {
  port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [path.join(projectRoot, 'src', 'server.js')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      REVIEW_ENGINE: 'stub',
      PLATFORM_FETCH_MODE: 'stub',
      REVIEW_STEP_DELAY_MS: '300',
      AI_BASE_URL: '',
      AI_API_KEY: '',
      AI_MODEL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  serverProcess.stdout.on('data', captureLogs);
  serverProcess.stderr.on('data', captureLogs);
  serverProcess.once('exit', (code) => {
    if (code !== null && code !== 0) serverLogs += `\n[server] 进程退出码 ${code}`;
  });

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // 服务尚未就绪，继续重试
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`服务未在预期时间内就绪。服务端输出：\n${serverLogs}`);
}

async function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
  await Promise.race([exited, timeout]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function waitForStatus(reviewId, expected, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const response = await api(`/api/reviews/${reviewId}`);
    if (response.status === 200) {
      last = response.json;
      if (last.status === expected) return last;
      if (last.status === 'failed' && expected === 'succeeded') return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待记录 ${reviewId} 进入 ${expected} 超时，最后状态：${JSON.stringify(last)}`);
}

const pasteDiff = [
  'diff --git a/src/auth/token.js b/src/auth/token.js',
  '--- a/src/auth/token.js',
  '+++ b/src/auth/token.js',
  '@@ -8,6 +8,12 @@ export function verifyToken(raw) {',
  '   const token = raw.trim();',
  '-  return jwt.decode(token);',
  '+  if (!token) {',
  '+    return null;',
  '+  }',
  '+  const payload = jwt.decode(token);',
  '+  return payload;',
  ' }',
  'diff --git a/src/api/userClient.js b/src/api/userClient.js',
  '--- a/src/api/userClient.js',
  '+++ b/src/api/userClient.js',
  '@@ -20,4 +20,8 @@ export async function loadUser(id) {',
  '   const response = await fetch(`/api/users/${id}`);',
  '+  const payload = await response.json();',
  '+  return payload;',
  ' }',
  'diff --git a/src/utils/format.js b/src/utils/format.js',
  '--- a/src/utils/format.js',
  '+++ b/src/utils/format.js',
  '@@ -3,3 +3,4 @@ export function formatName(name) {',
  '-  return name;',
  '+  return `${name}`.trim();',
  ' }',
  '',
].join('\n');

const failOnceDiff = [
  'diff --git a/src/service/orderService.js b/src/service/orderService.js',
  '--- a/src/service/orderService.js',
  '+++ b/src/service/orderService.js',
  '@@ -1,4 +1,6 @@',
  '// lingee-stub-fail-once',
  ' export function total(items) {',
  '-  return items.reduce((sum, item) => sum + item.price, 0);',
  '+  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);',
  ' }',
  '',
].join('\n');

const state = {};

const checks = [
  record('health-ok', async () => {
    const response = await api('/api/health');
    assertEqual(response.status, 200, '健康检查状态码');
    assert(response.json?.status === 'ok', '健康检查响应缺少 status=ok');
  }),

  record('settings-initial-unconfigured', async () => {
    const response = await api('/api/settings/platform');
    assertEqual(response.status, 200, '读取设置状态码');
    assertEqual(
      { configured: response.json.configured, platform: response.json.platform, tokenHint: response.json.tokenHint },
      { configured: false, platform: null, tokenHint: null },
      '初始凭证视图',
    );
  }),

  record('settings-invalid-input-rejected', async () => {
    const invalidBaseUrl = await api('/api/settings/platform', {
      method: 'PUT',
      body: { platform: 'github', baseUrl: 'ftp://github.com', token: 'abc' },
    });
    assertEqual(invalidBaseUrl.status, 400, '非法实例地址状态码');
    assertEqual(invalidBaseUrl.json?.error?.code, 'INVALID_INPUT', '非法实例地址错误码');

    const missingToken = await api('/api/settings/platform', {
      method: 'PUT',
      body: { platform: 'github', baseUrl: 'https://github.com' },
    });
    assertEqual(missingToken.status, 400, '首次配置缺少令牌状态码');
    assertEqual(missingToken.json?.error?.code, 'INVALID_INPUT', '首次配置缺少令牌错误码');

    const badPlatform = await api('/api/settings/platform', {
      method: 'PUT',
      body: { platform: 'bitbucket', baseUrl: 'https://github.com', token: 'abc' },
    });
    assertEqual(badPlatform.status, 400, '非法平台类型状态码');
  }),

  record('settings-save-masks-token', async () => {
    const response = await api('/api/settings/platform', {
      method: 'PUT',
      body: { platform: 'github', baseUrl: 'https://github.com/', token },
    });
    assertEqual(response.status, 200, '保存凭证状态码');
    assertEqual(
      { configured: response.json.configured, platform: response.json.platform, baseUrl: response.json.baseUrl, tokenHint: response.json.tokenHint },
      { configured: true, platform: 'github', baseUrl: 'https://github.com', tokenHint: '****A1b2' },
      '保存后的凭证视图',
    );
    assert(!response.text.includes(token), '保存响应包含令牌原文');

    const read = await api('/api/settings/platform');
    assertEqual(read.status, 200, '读取凭证状态码');
    assertEqual(read.json.tokenHint, '****A1b2', '读取的令牌掩码');
    assert(!read.text.includes(token), '读取响应包含令牌原文');

    const raw = await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8');
    assert(JSON.parse(raw).token === token, '凭证文件未保存令牌原文，后续拉取会失败');
  }),

  record('settings-clear-idempotent', async () => {
    const first = await api('/api/settings/platform', { method: 'DELETE' });
    assertEqual(first.status, 204, '清除凭证状态码');
    assertEqual(first.text, '', '清除凭证响应体');

    const read = await api('/api/settings/platform');
    assertEqual(read.json.configured, false, '清除后的配置状态');

    const second = await api('/api/settings/platform', { method: 'DELETE' });
    assertEqual(second.status, 204, '重复清除凭证状态码');
  }),

  record('review-paste-invalid-input-rejected', async () => {
    const empty = await api('/api/reviews', { method: 'POST', body: { mode: 'paste', diffText: '   \n  ' } });
    assertEqual(empty.status, 400, '空粘贴内容状态码');
    assertEqual(empty.json?.error?.code, 'INVALID_INPUT', '空粘贴内容错误码');

    const notCode = await api('/api/reviews', {
      method: 'POST',
      body: { mode: 'paste', diffText: '今天天气不错，请帮我写一份周报' },
    });
    assertEqual(notCode.status, 400, '非代码内容状态码');
    assertEqual(notCode.json?.error?.code, 'INVALID_INPUT', '非代码内容错误码');

    const badMode = await api('/api/reviews', { method: 'POST', body: { mode: 'upload' } });
    assertEqual(badMode.status, 400, '非法模式状态码');
    assertEqual(badMode.json?.error?.code, 'INVALID_INPUT', '非法模式错误码');

    const list = await api('/api/reviews');
    assertEqual(list.json?.total, 0, '输入校验失败后的记录数');
  }),

  record('review-paste-running-then-succeeded', async () => {
    const created = await api('/api/reviews', { method: 'POST', body: { mode: 'paste', diffText: pasteDiff } });
    assertEqual(created.status, 202, '创建审核状态码');
    state.pasteId = created.json?.id;
    assert(typeof state.pasteId === 'string' && /^[0-9a-f-]{36}$/.test(state.pasteId), '创建响应缺少 UUID 记录 ID');
    assertEqual(created.json.status, 'running', '创建后的初始状态');
    assertEqual(created.json.attempts, 1, '创建后的发起次数');
    assertEqual(created.json.findings, [], '创建后的问题清单');
    assertEqual(created.json.conclusion, null, '创建后的整体结论');
    assertEqual(created.json.source.type, 'paste', '创建后的来源类型');
    assertEqual(created.json.changeSummary.filesChanged, 3, '粘贴变更的文件数');

    const running = await api(`/api/reviews/${state.pasteId}`);
    assert(['running', 'succeeded'].includes(running.json.status), '刚创建记录的查询状态');

    const finished = await waitForStatus(state.pasteId, 'succeeded');
    assertEqual(finished.status, 'succeeded', '审核最终状态');
    assert(finished.conclusion && finished.conclusion.totalIssues > 0, '成功记录缺少问题总数');
    assert(finished.conclusion.highSeverityCount >= 1, '成功记录缺少高严重级问题');
    assertEqual(finished.findings.length, finished.conclusion.totalIssues, '问题条目数与结论不一致');
    assert(typeof finished.startedAt === 'string' && typeof finished.finishedAt === 'string', '缺少开始或结束时间');

    const rank = { high: 0, medium: 1, low: 2 };
    for (let index = 0; index < finished.findings.length; index += 1) {
      const finding = finished.findings[index];
      assertEqual(finding.id, `f${index + 1}`, '问题条目 ID 顺序');
      assert(typeof finding.file === 'string' && finding.file.length > 0, '问题条目缺少文件');
      assert(typeof finding.message === 'string' && finding.message.length > 0, '问题条目缺少说明');
      assert(typeof finding.suggestion === 'string' && finding.suggestion.length > 0, '问题条目缺少建议');
      assert(Object.hasOwn(rank, finding.severity), '问题级别超出高/中/低');
      assert(typeof finding.location === 'string', '问题位置类型错误');
      if (index > 0) {
        assert(
          rank[finished.findings[index - 1].severity] <= rank[finding.severity],
          '问题清单未按严重级别从高到低排列',
        );
      }
    }
    state.pasteTotalIssues = finished.conclusion.totalIssues;
  }),

  record('review-list-projection', async () => {
    const list = await api('/api/reviews');
    assertEqual(list.status, 200, '列表状态码');
    assertEqual(list.json.total, 1, '列表总数');
    const item = list.json.items[0];
    assertEqual(item.id, state.pasteId, '列表记录 ID');
    assertEqual(item.status, 'succeeded', '列表记录状态');
    assertEqual(item.sourceType, 'paste', '列表来源类型');
    assert(typeof item.sourceLabel === 'string' && item.sourceLabel.length > 0, '列表缺少来源摘要');
    assertEqual(item.issueCount, state.pasteTotalIssues, '列表问题数量');
    assert(item.highSeverityCount >= 1, '列表缺少高严重级问题数量');
    assert(!('findings' in item), '列表项不应返回问题清单');

    const filtered = await api('/api/reviews?status=failed');
    assertEqual(filtered.json.total, 0, '按失败状态过滤的记录数');
    const invalidFilter = await api('/api/reviews?status=unknown');
    assertEqual(invalidFilter.status, 400, '非法状态过滤状态码');
    const invalidLimit = await api('/api/reviews?limit=1000');
    assertEqual(invalidLimit.status, 400, '超限 limit 状态码');
  }),

  record('review-detail-not-found', async () => {
    const invalidId = await api('/api/reviews/not-a-uuid');
    assertEqual(invalidId.status, 404, '非法记录 ID 状态码');
    assertEqual(invalidId.json?.error?.code, 'NOT_FOUND', '非法记录 ID 错误码');

    const missing = await api(`/api/reviews/${randomUUID()}`);
    assertEqual(missing.status, 404, '不存在记录状态码');
    assertEqual(missing.json?.error?.code, 'NOT_FOUND', '不存在记录错误码');
  }),

  record('review-mrlink-credential-missing', async () => {
    const response = await api('/api/reviews', {
      method: 'POST',
      body: { mode: 'mr-link', url: 'https://github.com/acme/demo-repo/pull/42' },
    });
    assertEqual(response.status, 400, '未配置凭证状态码');
    assertEqual(response.json?.error?.code, 'CREDENTIAL_MISSING', '未配置凭证错误码');

    const list = await api('/api/reviews');
    assertEqual(list.json.total, 1, '未配置凭证时不应产生记录');
  }),

  record('review-mrlink-invalid-and-unsupported', async () => {
    await api('/api/settings/platform', {
      method: 'PUT',
      body: { platform: 'github', baseUrl: 'https://github.com', token },
    });

    const invalidLink = await api('/api/reviews', {
      method: 'POST',
      body: { mode: 'mr-link', url: 'https://github.com/acme/demo-repo' },
    });
    assertEqual(invalidLink.status, 400, '无法解析链接状态码');
    assertEqual(invalidLink.json?.error?.code, 'INVALID_LINK', '无法解析链接错误码');

    const wrongHost = await api('/api/reviews', {
      method: 'POST',
      body: { mode: 'mr-link', url: 'https://gitlab.com/acme/demo-repo/-/merge_requests/7' },
    });
    assertEqual(wrongHost.status, 400, '主机不匹配状态码');
    assertEqual(wrongHost.json?.error?.code, 'UNSUPPORTED_HOST', '主机不匹配错误码');

    const list = await api('/api/reviews');
    assertEqual(list.json.total, 1, '链接校验失败时不应产生记录');
  }),

  record('review-mrlink-platform-failures', async () => {
    const unauthorized = await api('/api/reviews', {
      method: 'POST',
      body: { mode: 'mr-link', url: 'https://github.com/acme/unauthorized-demo/pull/5' },
    });
    assertEqual(unauthorized.status, 502, '凭证失效状态码');
    assertEqual(unauthorized.json?.error?.code, 'PLATFORM_UNAUTHORIZED', '凭证失效错误码');
    assert(typeof unauthorized.json?.error?.message === 'string' && unauthorized.json.error.message.length > 0, '凭证失效缺少可读原因');

    const notFound = await api('/api/reviews', {
      method: 'POST',
      body: { mode: 'mr-link', url: 'https://github.com/acme/not-found-demo/pull/6' },
    });
    assertEqual(notFound.status, 502, '合并请求不存在状态码');
    assertEqual(notFound.json?.error?.code, 'PLATFORM_NOT_FOUND', '合并请求不存在错误码');

    const network = await api('/api/reviews', {
      method: 'POST',
      body: { mode: 'mr-link', url: 'https://github.com/acme/network-demo/pull/7' },
    });
    assertEqual(network.status, 502, '平台不可用状态码');
    assertEqual(network.json?.error?.code, 'PLATFORM_UNAVAILABLE', '平台不可用错误码');

    const list = await api('/api/reviews');
    assertEqual(list.json.total, 1, '平台拉取失败时不应产生记录');
  }),

  record('review-mrlink-succeeded', async () => {
    const created = await api('/api/reviews', {
      method: 'POST',
      body: { mode: 'mr-link', url: 'https://github.com/acme/demo-repo/pull/42' },
    });
    assertEqual(created.status, 202, '链接模式创建状态码');
    state.linkId = created.json?.id;
    assertEqual(created.json.source.type, 'mr-link', '链接模式来源类型');
    assertEqual(created.json.source.platform, 'github', '链接模式平台');
    assertEqual(created.json.source.repository, 'acme/demo-repo', '链接模式仓库');
    assertEqual(created.json.source.number, 42, '链接模式合并请求编号');
    assert(created.json.source.url.startsWith('https://github.com/acme/demo-repo/pull/42'), '链接模式原始链接');
    assertEqual(created.json.changeSummary.filesChanged, 2, '链接模式文件数');

    const finished = await waitForStatus(state.linkId, 'succeeded');
    assertEqual(finished.status, 'succeeded', '链接模式最终状态');
    assert(finished.findings.length >= 1, '链接模式未产出问题清单');

    const list = await api('/api/reviews');
    const item = list.json.items.find((entry) => entry.id === state.linkId);
    assertEqual(item.sourceLabel, 'acme/demo-repo #42', '链接模式列表来源摘要');
  }),

  record('review-retry-conflict-while-running', async () => {
    const created = await api('/api/reviews', { method: 'POST', body: { mode: 'paste', diffText: pasteDiff } });
    assertEqual(created.status, 202, '并发场景创建状态码');
    state.runningId = created.json.id;
    assertEqual(created.json.status, 'running', '并发场景初始状态');

    const conflict = await api(`/api/reviews/${state.runningId}/retry`, { method: 'POST' });
    assertEqual(conflict.status, 409, '进行中重试状态码');
    assertEqual(conflict.json?.error?.code, 'CONFLICT', '进行中重试错误码');

    await waitForStatus(state.runningId, 'succeeded');
  }),

  record('review-failure-visible-and-retryable', async () => {
    const created = await api('/api/reviews', { method: 'POST', body: { mode: 'paste', diffText: failOnceDiff } });
    assertEqual(created.status, 202, '失败场景创建状态码');
    state.failId = created.json.id;

    const failed = await waitForStatus(state.failId, 'failed');
    assertEqual(failed.status, 'failed', '首次审核最终状态');
    assertEqual(failed.failure?.code, 'REVIEW_RESULT_INVALID', '失败原因码');
    assert(typeof failed.failure?.message === 'string' && failed.failure.message.length > 0, '失败原因缺少可读提示');
    assertEqual(failed.findings, [], '失败记录不应包含问题清单');
    assertEqual(failed.conclusion, null, '失败记录不应包含整体结论');

    const retried = await api(`/api/reviews/${state.failId}/retry`, { method: 'POST' });
    assertEqual(retried.status, 202, '重试状态码');
    assertEqual(retried.json.status, 'running', '重试后的状态');
    assertEqual(retried.json.attempts, 2, '重试后的发起次数');
    assertEqual(retried.json.failure, null, '重试后应清空失败原因');
    assertEqual(retried.json.findings, [], '重试后应清空问题清单');

    const succeeded = await waitForStatus(state.failId, 'succeeded');
    assertEqual(succeeded.status, 'succeeded', '重试后的最终状态');
    assertEqual(succeeded.attempts, 2, '重试后的记录发起次数');
    assert(succeeded.findings.length >= 1, '重试成功后未产出问题清单');
  }),

  record('review-too-large-fails-with-reason', async () => {
    const largeDiff = `diff --git a/src/big.js b/src/big.js\n--- a/src/big.js\n+++ b/src/big.js\n@@ -1,1 +1,1 @@\n${'+const value = 1; // padding line for size limit\n'.repeat(9000)}`;
    assert(largeDiff.length > 400000, '构造的超大变更未超过上限');
    const created = await api('/api/reviews', { method: 'POST', body: { mode: 'paste', diffText: largeDiff } });
    assertEqual(created.status, 202, '超大变更创建状态码');
    state.largeId = created.json.id;

    const failed = await waitForStatus(state.largeId, 'failed', 30000);
    assertEqual(failed.status, 'failed', '超大变更最终状态');
    assertEqual(failed.failure?.code, 'REVIEW_TOO_LARGE', '超大变更失败原因码');
  }),

  record('review-delete-removes-record', async () => {
    const deleted = await api(`/api/reviews/${state.failId}`, { method: 'DELETE' });
    assertEqual(deleted.status, 204, '删除记录状态码');
    assertEqual(deleted.text, '', '删除记录响应体');

    const reread = await api(`/api/reviews/${state.failId}`);
    assertEqual(reread.status, 404, '删除后读取状态码');

    const list = await api('/api/reviews?limit=200');
    assert(!list.json.items.some((item) => item.id === state.failId), '删除后列表仍存在该记录');
    const directoryExists = await fs
      .stat(path.join(dataDir, 'reviews', state.failId))
      .then(() => true)
      .catch(() => false);
    assert(!directoryExists, '删除后记录目录仍存在');

    const again = await api(`/api/reviews/${state.failId}`, { method: 'DELETE' });
    assertEqual(again.status, 404, '重复删除状态码');
  }),

  record('startup-recovery-marks-interrupted', async () => {
    const recoveryId = randomUUID();
    const recoveryDir = path.join(dataDir, 'reviews', recoveryId);
    await fs.mkdir(recoveryDir, { recursive: true });
    const createdAt = new Date().toISOString();
    await fs.writeFile(
      path.join(recoveryDir, 'record.json'),
      `${JSON.stringify(
        {
          id: recoveryId,
          status: 'running',
          source: { type: 'paste', url: null, platform: null, repository: null, number: null, label: '粘贴的变更' },
          createdAt,
          startedAt: createdAt,
          finishedAt: null,
          attempts: 1,
          changeSummary: { filesChanged: 1, additions: 1, deletions: 0 },
          conclusion: null,
          findings: [],
          failure: null,
        },
        null,
        2,
      )}\n`,
    );
    await fs.writeFile(path.join(recoveryDir, 'diff.patch'), '+const pending = 1;\n');

    await stopServer();
    await startServer();

    const recovered = await api(`/api/reviews/${recoveryId}`);
    assertEqual(recovered.status, 200, '恢复后记录状态码');
    assertEqual(recovered.json.status, 'failed', '恢复后的记录状态');
    assertEqual(recovered.json.failure?.code, 'INTERRUPTED', '恢复后的失败原因码');
    assert(typeof recovered.json.finishedAt === 'string', '恢复后的记录缺少结束时间');

    const retried = await api(`/api/reviews/${recoveryId}/retry`, { method: 'POST' });
    assertEqual(retried.status, 202, '恢复记录重试状态码');
    assertEqual(retried.json.status, 'running', '恢复记录重试后的状态');
    const finished = await waitForStatus(recoveryId, 'succeeded');
    assertEqual(finished.status, 'succeeded', '恢复记录重试后的最终状态');

    state.recoveryId = recoveryId;
  }),

  record('non-api-path-404-without-build', async () => {
    const root = await fetch(`${baseUrl}/`);
    assertEqual(root.status, 404, '无前端产物时根路径状态码');
    const unknownApi = await api('/api/unknown-endpoint');
    assertEqual(unknownApi.status, 404, '未知接口状态码');
    assertEqual(unknownApi.json?.error?.code, 'NOT_FOUND', '未知接口错误码');
    const methodNotAllowed = await fetch(`${baseUrl}/index.html`, { method: 'POST' });
    assertEqual(methodNotAllowed.status, 404, '无前端产物时非 GET 状态码');
  }),
];

async function main() {
  await fs.mkdir(runRoot, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const results = [];
  let startupError = null;
  try {
    await startServer();
  } catch (error) {
    startupError = error;
  }

  if (startupError) {
    results.push({ checkId: 'server-startup', status: 'failed', detail: String(startupError.message ?? startupError) });
  } else {
    for (const entry of checks) {
      try {
        await entry.fn();
        results.push({ checkId: entry.checkId, status: 'passed' });
        console.log(`通过  ${entry.checkId}`);
      } catch (error) {
        results.push({ checkId: entry.checkId, status: 'failed', detail: String(error?.message ?? error) });
        console.log(`失败  ${entry.checkId}：${error?.message ?? error}`);
      }
    }
  }

  await stopServer().catch(() => {});
  await fs.rm(runRoot, { recursive: true, force: true }).catch(() => {});
  await fs.rmdir(path.join(projectRoot, 'scripts', '.verify-tmp')).catch(() => {});

  const failed = results.filter((result) => result.status !== 'passed');
  console.log(`\n验收结果：通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`);
  if (failed.length > 0) {
    for (const result of failed) console.log(`- ${result.checkId}：${result.detail ?? '未通过'}`);
    if (serverLogs) console.log(`\n服务端输出（末尾）：\n${serverLogs}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('验收脚本自身异常', error);
  process.exitCode = 1;
});