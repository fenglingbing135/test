import { parseDiffFiles } from './diff.js';
import { ReviewError } from '../errors.js';

/**
 * 确定性审核实现，仅在 `REVIEW_ENGINE=stub` 时启用（验收使用，界面不暴露入口）。
 * 规则：从 diff 解析文件与首个 hunk 行号，按文件顺序轮换高/中/低级别生成固定问题条目。
 * 失败注入：变更内容包含 `lingee-stub-fail` 时固定失败；包含 `lingee-stub-fail-once` 时首次失败、重试成功。
 */
const TEMPLATES = [
  {
    severity: 'high',
    message: '新增逻辑缺少空值与异常分支处理，异常输入会直接抛出运行时错误',
    suggestion: '在入口校验参数并对可能失败的调用补充异常处理与错误提示',
  },
  {
    severity: 'medium',
    message: '同一函数承担了过多职责，条件分支嵌套过深，后续修改容易引入回归',
    suggestion: '拆分复杂分支为具名函数，并为关键分支补充单元测试',
  },
  {
    severity: 'low',
    message: '命名风格与本仓库既有约定不一致，影响阅读一致性',
    suggestion: '按仓库命名约定统一变量、函数与文件命名',
  },
];

export function createStubReviewEngine() {
  return {
    /**
     * @param {{ diffText: string, record: object }} input
     * @returns {Promise<Array<{ file: string, location: string, snippet: string | null, severity: string, message: string, suggestion: string }>>}
     */
    async review({ diffText, record }) {
      const text = typeof diffText === 'string' ? diffText : '';
      const attempt = Number.isInteger(record?.attempts) ? record.attempts : 1;
      const failOnce = text.includes('lingee-stub-fail-once');

      if (failOnce ? attempt <= 1 : text.includes('lingee-stub-fail')) {
        throw new ReviewError('REVIEW_RESULT_INVALID', '模拟审核失败：模型输出无法解析，可重新发起');
      }

      const files = parseDiffFiles(text);
      const targets = files.length > 0 ? files : [{ file: 'pasted-changes', hunks: [] }];

      return targets.map((target, index) => {
        const template = TEMPLATES[index % TEMPLATES.length];
        const hunk = target.hunks[0];
        return {
          file: target.file,
          location: hunk ? formatLocation(hunk) : '',
          snippet: hunk && hunk.lines.length > 0 ? hunk.lines.slice(0, 8).join('\n') : null,
          severity: template.severity,
          message: template.message,
          suggestion: template.suggestion,
        };
      });
    },
  };
}

function formatLocation(hunk) {
  const start = hunk.start;
  const count = hunk.count ?? 1;
  if (count <= 1) return `L${start}`;
  return `L${start}-L${start + count - 1}`;
}