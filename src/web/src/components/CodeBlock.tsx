import { useState } from 'react';
import { Button } from 'antd';

const DEFAULT_COLLAPSED_LINES = 10;

interface CodeBlockProps {
  code: string;
  collapsedLines?: number;
}

/** 代码片段块：等宽字体、限高并可展开/收起，用于展示问题对应的变更片段。 */
export function CodeBlock({ code, collapsedLines = DEFAULT_COLLAPSED_LINES }: CodeBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = code.split(/\r?\n/);
  const collapsible = lines.length > collapsedLines;
  const visibleLines = expanded || !collapsible ? lines : lines.slice(0, collapsedLines);

  return (
    <div className="code-block">
      <pre className="code-block__body">
        {visibleLines.map((line, index) => (
          <span key={index} className={`code-block__line${lineClassName(line)}`}>
            {line === '' ? ' ' : line}
          </span>
        ))}
        {collapsible && !expanded ? <span className="code-block__line code-block__line--more">…</span> : null}
      </pre>
      {collapsible ? (
        <Button className="code-block__toggle" type="link" size="small" onClick={() => setExpanded((previous) => !previous)}>
          {expanded ? '收起代码片段' : `展开全部 ${lines.length} 行`}
        </Button>
      ) : null}
    </div>
  );
}

function lineClassName(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return ' code-block__line--add';
  if (line.startsWith('-') && !line.startsWith('---')) return ' code-block__line--del';
  if (line.startsWith('@@')) return ' code-block__line--meta';
  return '';
}