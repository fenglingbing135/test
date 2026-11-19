import { useState } from 'react';
import { BulbOutlined, FileTextOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { ReviewFinding } from '../api/types';
import { CodeBlock } from './CodeBlock';
import { SeverityTag } from './SeverityTag';

interface FindingCardProps {
  finding: ReviewFinding;
  index: number;
}

const MESSAGE_PREVIEW_LIMIT = 180;

/** 单条问题条目：位置、级别、说明与改进建议，附可展开的变更片段。 */
export function FindingCard({ finding, index }: FindingCardProps) {
  const [messageExpanded, setMessageExpanded] = useState(false);
  const messageCollapsible = finding.message.length > MESSAGE_PREVIEW_LIMIT;
  const messageText =
    messageCollapsible && !messageExpanded
      ? `${finding.message.slice(0, MESSAGE_PREVIEW_LIMIT)}…`
      : finding.message;

  return (
    <article className="finding-card">
      <header className="finding-card__head">
        <span className="finding-card__index">#{index}</span>
        <SeverityTag severity={finding.severity} />
        <Tooltip title={finding.file}>
          <span className="finding-card__file">
            <FileTextOutlined />
            <span className="finding-card__file-text">{finding.file}</span>
          </span>
        </Tooltip>
        {finding.location ? (
          <span className="finding-card__location">{finding.location}</span>
        ) : (
          <span className="finding-card__location finding-card__location--empty">位置未标注</span>
        )}
      </header>

      <p className="finding-card__message">
        {messageText}
        {messageCollapsible ? (
          <button
            type="button"
            className="text-toggle"
            onClick={() => setMessageExpanded((previous) => !previous)}
          >
            {messageExpanded ? '收起' : '展开全文'}
          </button>
        ) : null}
      </p>

      {finding.suggestion ? (
        <div className="finding-card__suggestion">
          <BulbOutlined />
          <span>{finding.suggestion}</span>
        </div>
      ) : null}

      {finding.snippet ? <CodeBlock code={finding.snippet} /> : null}
    </article>
  );
}