import { ReviewError } from '../errors.js';

/**
 * OpenAI 兼容对话补全客户端：超时控制、错误映射。
 * 服务地址、密钥与模型名只来自服务端环境变量（部署配置），不在界面配置。
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [options]
 */
export function createProvider({ env = process.env, fetchImpl = fetch } = {}) {
  const config = readAiConfig(env);

  return {
    config,
    get configured() {
      return config !== null;
    },

    /**
     * 调用 `/chat/completions`，返回助手消息文本。
     * @param {{ messages: Array<{ role: string, content: string }>, json?: boolean }} input
     * @returns {Promise<string>}
     */
    async complete({ messages, json = true }) {
      if (!config) {
        throw new ReviewError('AI_NOT_CONFIGURED', '审核服务未配置，请联系部署者');
      }
      const endpoint = completionEndpoint(config.baseUrl);
      /** @type {Record<string, unknown>} */
      const body = {
        model: config.model,
        messages,
        temperature: 0,
        stream: false,
      };
      if (json && config.jsonMode) body.response_format = { type: 'json_object' };

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        throw new ReviewError('AI_UNAVAILABLE', `审核服务暂时不可用，可重新发起（${describeNetworkError(error)}）`);
      }

      if (!response.ok) {
        throw new ReviewError('AI_UNAVAILABLE', `审核服务暂时不可用，可重新发起（模型服务返回 ${response.status}）`);
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new ReviewError('REVIEW_RESULT_INVALID', '审核结果无法解析，可重新发起');
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const joined = content
          .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
          .join('');
        if (joined) return joined;
      }
      throw new ReviewError('REVIEW_RESULT_INVALID', '审核结果无法解析，可重新发起');
    },
  };
}

export function readAiConfig(env = process.env) {
  const baseUrl = String(env.AI_BASE_URL ?? '').trim();
  const apiKey = String(env.AI_API_KEY ?? '').trim();
  const model = String(env.AI_MODEL ?? '').trim();
  if (!baseUrl || !apiKey || !model) return null;

  const timeoutRaw = Number.parseInt(String(env.AI_TIMEOUT_MS ?? '').trim(), 10);
  const timeoutMs = Number.isInteger(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 60000;
  const jsonMode = String(env.AI_JSON_MODE ?? '').trim().toLowerCase() !== 'off';

  return { baseUrl, apiKey, model, timeoutMs, jsonMode };
}

function completionEndpoint(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function describeNetworkError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return '请求超时';
  return '网络错误';
}