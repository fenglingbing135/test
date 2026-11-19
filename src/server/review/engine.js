import { createProvider } from './provider.js';
import { createStubReviewEngine } from './stub-engine.js';
import { ReviewError } from '../errors.js';

/** 单次审核可处理的 diff 字符上限（技术契约 5.3） */
export const MAX_DIFF_CHARS = 400000;

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

const SYSTEM_PROMPT = [
  '你是一名资深代码审核工程师，审核对象是合并请求的代码变更（统一 diff）。',
  '请只依据给出的变更内容找出真实存在的问题，不要编造文件中不存在的代码。',
  '必须只输出一个 JSON 对象，不要输出 Markdown 代码块或任何解释文字，结构如下：',
  '{"findings":[{"file":"仓库内相对路径","location":"L42-L58 或空字符串","snippet":"相关变更片段或 null","severity":"high|medium|low","message":"问题说明","suggestion":"改进建议"}]}',
  '严重级别定义：high 为会导致错误、安全问题或数据损坏；medium 为可维护性或边界处理风险；low 为风格与可读性问题。',
  '未发现问题时输出 {"findings":[]}。',
].join('\n');

const REPAIR_PROMPT = [
  '上一次输出无法解析为约定的 JSON。请重新输出，只返回一个 JSON 对象，',
  '形如 {"findings":[{"file":"","location":"","snippet":null,"severity":"high","message":"","suggestion":""}]}，不要包含任何其它内容。',
].join('\n');

/**
 * 审核引擎：规模判定 → 调用实现（live / stub）→ 校验与归一化问题清单。
 * `REVIEW_ENGINE=stub` 仅用于验收，默认 `live` 行为不变。
 * @param {{ mode?: 'live' | 'stub', provider?: ReturnType<typeof createProvider>, stubEngine?: ReturnType<typeof createStubReviewEngine>, env?: NodeJS.ProcessEnv }} [options]
 */
export function createReviewEngine({ mode = 'live', provider, stubEngine, env = process.env } = {}) {
  const liveProvider = provider ?? createProvider({ env });
  const stub = stubEngine ?? createStubReviewEngine();

  return {
    mode,

    /**
     * @param {{ diffText: string, record: object }} input
     * @returns {Promise<Array<object>>} 已排序并分配 id 的问题清单
     */
    async review({ diffText, record }) {
      const text = typeof diffText === 'string' ? diffText : '';
      if (text.length > MAX_DIFF_CHARS) {
        throw new ReviewError(
          'REVIEW_TOO_LARGE',
          `变更内容超出单次可处理范围（${text.length} 字符，上限 ${MAX_DIFF_CHARS}），请拆分后重新发起`,
        );
      }

      const rawFindings = mode === 'stub' ? await stub.review({ diffText: text, record }) : await liveReview(liveProvider, text);
      const findings = normalizeFindings(rawFindings);
      if (!findings) {
        throw new ReviewError('REVIEW_RESULT_INVALID', '审核结果无法解析，可重新发起');
      }
      return findings;
    },
  };
}

async function liveReview(provider, diffText) {
  if (!provider.configured) {
    throw new ReviewError('AI_NOT_CONFIGURED', '审核服务未配置，请联系部署者');
  }
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `请审核以下代码变更：\n\n${diffText}` },
  ];

  const first = await provider.complete({ messages });
  const parsedFirst = parseFindingsPayload(first);
  if (parsedFirst) return parsedFirst;

  const repaired = await provider.complete({
    messages: [...messages, { role: 'assistant', content: first }, { role: 'user', content: REPAIR_PROMPT }],
  });
  const parsedRepaired = parseFindingsPayload(repaired);
  if (parsedRepaired) return parsedRepaired;

  throw new ReviewError('REVIEW_RESULT_INVALID', '审核结果无法解析，可重新发起');
}

/**
 * 从模型输出中提取 findings 数组；结构不符合约定时返回 null。
 * @param {string} text
 */
export function parseFindingsPayload(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const candidates = [withoutFence];
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(withoutFence.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.findings)) return parsed.findings;
    } catch {
      // 继续尝试下一个候选片段
    }
  }
  return null;
}

/**
 * 校验并归一化问题清单：级别限定高/中/低，分配 f1..fn，按级别、文件、行号排序。
 * @param {unknown} raw
 * @returns {Array<object> | null}
 */
export function normalizeFindings(raw) {
  if (!Array.isArray(raw)) return null;
  const normalized = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const file = typeof item.file === 'string' ? item.file.trim() : '';
    const message = typeof item.message === 'string' ? item.message.trim() : '';
    const suggestion = typeof item.suggestion === 'string' ? item.suggestion.trim() : '';
    const severity = typeof item.severity === 'string' ? item.severity.trim().toLowerCase() : '';
    if (!file || !message || !Object.hasOwn(SEVERITY_RANK, severity)) return null;

    normalized.push({
      file,
      location: normalizeLocation(item.location),
      snippet: typeof item.snippet === 'string' && item.snippet.trim() ? item.snippet : null,
      severity,
      message,
      suggestion,
    });
  }

  normalized.sort(compareFindings);
  return normalized.map((finding, index) => ({ id: `f${index + 1}`, ...finding }));
}

function normalizeLocation(location) {
  if (typeof location === 'number' && Number.isFinite(location)) return `L${location}`;
  if (typeof location !== 'string') return '';
  return location.trim();
}

function compareFindings(a, b) {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  const byFile = a.file.localeCompare(b.file);
  if (byFile !== 0) return byFile;
  return startLine(a.location) - startLine(b.location);
}

function startLine(location) {
  const match = /(\d+)/.exec(location ?? '');
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}