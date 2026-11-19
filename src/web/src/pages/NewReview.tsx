import { useState } from 'react';
import { ArrowRightOutlined, FileTextOutlined, LinkOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, App as AntdApp, Button, Form, Input, Segmented } from 'antd';
import { createReview } from '../api/client';
import { describeError } from '../api/messages';
import type { PlatformSettings, ReviewDetail } from '../api/types';
import { InlineError } from '../components/InlineError';
import { isRecognizableChange, parseMergeRequestLink } from '../utils/validation';

type ReviewMode = 'paste' | 'mr-link';

interface NewReviewFormValues {
  diffText?: string;
  url?: string;
}

interface NewReviewProps {
  settings: PlatformSettings | null;
  settingsLoading: boolean;
  onCreated: (review: ReviewDetail) => void;
  onOpenSettings: () => void;
}

const PLATFORM_LABEL: Record<'github' | 'gitlab', string> = { github: 'GitHub', gitlab: 'GitLab' };

/**
 * 新建审核：粘贴变更 / MR 链接双模式表单。
 * 拉取或校验失败时在表单内就地提示，不创建记录、不跳转。
 */
export function NewReview({ settings, settingsLoading, onCreated, onOpenSettings }: NewReviewProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<NewReviewFormValues>();
  const [mode, setMode] = useState<ReviewMode>('paste');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; code: string | null } | null>(null);

  const configured = settings?.configured === true;
  const needsCredential = error?.code === 'CREDENTIAL_MISSING';

  const handleModeChange = (next: ReviewMode) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async () => {
    const fields = mode === 'paste' ? ['diffText'] : ['url'];
    let values: NewReviewFormValues;
    try {
      values = await form.validateFields(fields);
    } catch {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const review =
        mode === 'paste'
          ? await createReview({ mode: 'paste', diffText: values.diffText ?? '' })
          : await createReview({ mode: 'mr-link', url: (values.url ?? '').trim() });
      message.success('已发起审核，正在自动跟进状态');
      form.resetFields();
      onCreated(review);
    } catch (caught) {
      const info = describeError(caught);
      setError({ message: info.message, code: info.code });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel page-panel">
      <header className="page-panel__head">
        <h1 className="page-panel__title">新建审核</h1>
        <p className="page-panel__desc">
          粘贴合并请求的变更内容，或填写 MR 链接由系统拉取。AI 会逐条给出问题位置、严重级别、问题说明与改进建议。
        </p>
      </header>

      <div className="page-panel__body">
        <Segmented
          className="mode-switch"
          block
          value={mode}
          onChange={(value) => handleModeChange(value as ReviewMode)}
          options={[
            { value: 'paste', label: <span className="mode-switch__item"><FileTextOutlined /> 粘贴变更</span> },
            { value: 'mr-link', label: <span className="mode-switch__item"><LinkOutlined /> MR 链接</span> },
          ]}
        />

        <Form form={form} layout="vertical" requiredMark={false} className="review-form">
          <div style={{ display: mode === 'paste' ? undefined : 'none' }}>
            <Form.Item
              name="diffText"
              label="变更内容"
              rules={[
                {
                  validator: (_rule, value: string) => {
                    if (!value || !value.trim()) return Promise.reject(new Error('请粘贴合并请求的变更内容'));
                    if (!isRecognizableChange(value)) {
                      return Promise.reject(new Error('未能从内容中识别出代码变更，请粘贴 diff 或代码片段'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <Input.TextArea
                className="paste-input"
                placeholder={'diff --git a/src/app.ts b/src/app.ts\n@@ -1,4 +1,8 @@\n+export function loadUser(id) {\n+  return users[id];'}
                autoSize={{ minRows: 12, maxRows: 22 }}
                spellCheck={false}
              />
            </Form.Item>
            <p className="form-hint">支持统一 diff（diff --git、@@）或包含代码特征的变更片段；内容为空或无法识别时不会发起审核。</p>
          </div>

          <div style={{ display: mode === 'mr-link' ? undefined : 'none' }}>
            {settingsLoading ? (
              <Alert className="settings-hint" type="info" showIcon message="正在读取平台凭证配置…" />
            ) : configured ? (
              <Alert
                className="settings-hint"
                type="info"
                showIcon
                message={`将使用 ${PLATFORM_LABEL[settings?.platform ?? 'github']}${
                  settings?.baseUrl ? `（${settings.baseUrl}）` : ''
                } 的凭证拉取该合并请求的变更`}
                action={
                  <Button size="small" type="link" icon={<SettingOutlined />} onClick={onOpenSettings}>
                    修改配置
                  </Button>
                }
              />
            ) : (
              <Alert
                className="settings-hint"
                type="warning"
                showIcon
                message="尚未配置平台凭证"
                description="链接方式需要先在平台设置中填写平台类型、实例地址与访问令牌。"
                action={
                  <Button size="small" type="primary" ghost icon={<SettingOutlined />} onClick={onOpenSettings}>
                    前往平台设置
                  </Button>
                }
              />
            )}

            <Form.Item
              name="url"
              label="合并请求链接"
              rules={[
                {
                  validator: (_rule, value: string) => {
                    const raw = (value ?? '').trim();
                    if (!raw) return Promise.reject(new Error('请填写合并请求链接'));
                    if (!parseMergeRequestLink(raw)) {
                      return Promise.reject(new Error('无法从链接中解析出仓库与合并请求编号，请检查链接'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <Input
                className="link-input"
                placeholder={
                  settings?.platform === 'gitlab'
                    ? 'https://gitlab.com/group/project/-/merge_requests/12'
                    : 'https://github.com/owner/repo/pull/123'
                }
                allowClear
              />
            </Form.Item>
            <p className="form-hint">拉取在创建记录前同步执行：链接无效、凭证缺失或无权访问时直接提示原因，不会产生空记录。</p>
          </div>

          {error ? (
            <InlineError
              className="form-error"
              title={needsCredential ? '需要先完成平台凭证配置' : '发起审核失败'}
              message={error.message}
              action={
                needsCredential ? (
                  <Button size="small" icon={<SettingOutlined />} onClick={onOpenSettings}>
                    前往平台设置
                  </Button>
                ) : null
              }
            />
          ) : null}

          <div className="form-actions">
            <Button
              type="primary"
              size="large"
              icon={<ArrowRightOutlined />}
              loading={submitting}
              onClick={() => void handleSubmit()}
            >
              发起审核
            </Button>
            <span className="form-actions__hint">提交后审核在后台执行，可离开本页，稍后在审核历史查看结果。</span>
          </div>
        </Form>
      </div>
    </div>
  );
}