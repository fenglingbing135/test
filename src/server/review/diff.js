/**
 * 变更内容解析：文件识别、行数统计、可识别性判定。
 * 服务端一处实现，供路由输入校验、粘贴摘要与 stub 审核引擎共用。
 */

const CODE_FEATURE = /[;{}=#]|\/\/|</;
const DIFF_MARKER = /^(?:diff --git |@@ |\+\+\+ |--- )/m;

/**
 * 判断文本能否被识别为代码变更（技术契约 5.3 第 1 步）。
 * @param {string} text
 * @returns {boolean}
 */
export function isRecognizableChange(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (DIFF_MARKER.test(text)) return true;
  return text
    .split(/\r?\n/)
    .some((line) => line.trim() !== '' && CODE_FEATURE.test(line));
}

/**
 * 按统一 diff 结构解析文件与 hunk 位置；无法识别 diff 结构时返回空数组。
 * @param {string} diffText
 * @returns {Array<{ file: string, hunks: Array<{ start: number, count: number, lines: string[] }> }>}
 */
export function parseDiffFiles(diffText) {
  const text = typeof diffText === 'string' ? diffText : '';
  const files = [];
  /** @type {{ file: string, hunks: Array<{ start: number, count: number, lines: string[] }> } | null} */
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const gitHeader = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (gitHeader) {
      current = { file: gitHeader[2].trim(), hunks: [] };
      files.push(current);
      continue;
    }

    const plusHeader = /^\+\+\+ (?:b\/)?(.+)$/.exec(line);
    if (plusHeader) {
      const file = plusHeader[1].trim();
      if (file !== '/dev/null') {
        if (!current || current.file !== file) {
          current = { file, hunks: [] };
          files.push(current);
        }
      }
      continue;
    }

    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkHeader) {
      if (current) {
        current.hunks.push({
          start: Number(hunkHeader[1]),
          count: hunkHeader[2] === undefined ? 1 : Number(hunkHeader[2]),
          lines: [],
        });
      }
      continue;
    }

    if (current && current.hunks.length > 0) {
      const lastHunk = current.hunks[current.hunks.length - 1];
      if (lastHunk.lines.length < 40) lastHunk.lines.push(line);
    }
  }

  return files;
}

/**
 * 变更规模摘要：文件数、新增行数、删除行数。
 * 非 diff 的代码片段按「单个文件、全部按新增行」统计，保证列表与详情有可展示的规模信息。
 * @param {string} diffText
 * @returns {{ filesChanged: number, additions: number, deletions: number }}
 */
export function summarizeDiff(diffText) {
  const text = typeof diffText === 'string' ? diffText : '';
  const files = parseDiffFiles(text);
  const isDiff = files.length > 0;
  let additions = 0;
  let deletions = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }

  if (!isDiff) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    additions = lines.length;
    deletions = 0;
  }

  return {
    filesChanged: isDiff ? files.length : linesOrZero(text),
    additions,
    deletions,
  };
}

function linesOrZero(text) {
  return text.trim() ? 1 : 0;
}

/**
 * 粘贴模式的列表摘要标签：首个文件路径或「粘贴的变更」。
 * @param {string} diffText
 * @returns {string}
 */
export function pasteSourceLabel(diffText) {
  const files = parseDiffFiles(diffText);
  if (files.length > 0 && files[0].file) return files[0].file;
  return '粘贴的变更';
}