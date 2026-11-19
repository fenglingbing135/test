import type { ReactNode } from 'react';
import { Alert } from 'antd';

interface InlineErrorProps {
  message: string;
  title?: string;
  action?: ReactNode;
  className?: string;
}

/** 就地错误提示：拉取失败、加载失败等场景保留当前页面并给出可执行动作。 */
export function InlineError({ message, title = '操作失败', action, className }: InlineErrorProps) {
  return (
    <Alert
      className={className}
      type="error"
      showIcon
      message={title}
      description={
        <div className="inline-error">
          <div className="inline-error__message">{message}</div>
          {action ? <div className="inline-error__action">{action}</div> : null}
        </div>
      }
    />
  );
}