import { useCallback, useEffect, useState } from 'react';
import { ClearOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { clearPlatformSettings, fetchPlatformSettings, savePlatformSettings } from '../api/client';
import { describeError } from '../api/messages';
import type { Platform, PlatformSettings } from '../api/types';
import { InlineError } from '../components/InlineError';
import { defaultBaseUrl, validateBaseUrl } from '../utils/validation';
import { formatDateTime } from '../utils/format';

interface SettingsFormValues {
  platform: Platform;
  baseUrl: string;
  token?: string;
}

interface SettingsProps {
  settings: PlatformSettings | null;
  loading: boolean;
  error: string | null;
  onReload: () => void | Promise<void>;
  onUpdated: (settings: PlatformSettings) => void;
}

const PLATFORM_OPTIONS = [
  { value: 'github', label: 'GitHub（含自建实例）' },
  { value: 'gitlab', label: 'GitLab（含自建实例）' },
];

/**
 * 平台设置：平台类型、实例地址与访问令牌的配置与清除。
 * 令牌只在保存时上送，读取接口只返回末 4 位掩码。
 */
export function Settings({ settings, loading, error, onReload, onUpdated }: SettingsProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<SettingsFormValues>();
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const platform = Form.useWatch('platform', form) ?? settings?.platform ?? 'github';

  useEffect(() => {
    form.setFieldsValue({
      platform: settings?.platform ?? 'github',
      baseUrl: settings?.baseUrl ?? '',
      token: '',
    });
  }, [form, settings]);

  const handleSave = async (values: SettingsFormValues) => {
    setSaving(true);
    setActionError(null);
    try {
      const token = values.token?.trim();
      const saved = await savePlatformSettings({
        platform: values.platform,
        baseUrl: values.baseUrl.trim(),
        ...(token ? { token } : {}),
      });
      onUpdated(saved);
      form.setFieldsValue({ platform: saved.platform ?? values.platform, baseUrl: saved.baseUrl ?? '', token: '' });
      message.success('平台凭证已保存');
    } catch (caught) {
      setActionError(describeError(caught).message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setActionError(null);
    try {
      await clearPlatformSettings();
      message.success('平台凭证已清除');
      const next = await fetchPlatformSettings();
      onUpdated(next);
      form.setFieldsValue({ platform: next.platform ?? 'github', baseUrl: next.baseUrl ?? '', token: '' });
    } catch (caught) {
      setActionError(describeError(caught).message);
    } finally {
      setClearing(false);
    }
  };

  const handleReload = useCallback(() => {
    setActionError(null);
    void onReload();
  }, [onReload]);

  if (loading && !settings) {
    return (
      <Card className="surface-card">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  if (error && !settings) {
    return (
      <Card className="surface-card">
        <InlineError
          title="平台配置读取失败"
          message={error}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={handleReload}>
              重新加载
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="settings-page">
      <Card className="surface-card">
        <div className="settings-head">
          <div>
            <h1 className="page-panel__title">平台设置</h1>
            <p className="page-panel__desc">
              配置代码托管平台的实例地址与访问令牌，用于以 MR 链接方式拉取变更；审核请求本身只使用变更内容。
            </p>
          </div>
        </div>

        <div className="settings-status">
          {settings?.configured ? (
            <Space size={8} wrap>
              <Tag color="success" style={{ marginInlineEnd: 0 }}>
                已配置
              </Tag>
              <span className="settings-status__text">
                {settings.platform === 'gitlab' ? 'GitLab' : 'GitHub'} · {settings.baseUrl ?? '—'} · 令牌{' '}
                {settings.tokenHint ?? '—'}
              </span>
              <span className="settings-status__time">更新于 {formatDateTime(settings.updatedAt)}</span>
            </Space>
          ) : (
            <Space size={8} wrap>
              <Tag style={{ marginInlineEnd: 0 }}>未配置</Tag>
              <span className="settings-status__text">未配置凭证时，MR 链接方式无法拉取变更。</span>
            </Space>
          )}
        </div>

        {settings?.configured ? null : (
          <Alert
            className="settings-alert"
            type="warning"
            showIcon
            message="尚未配置平台凭证"
            description="以 MR 链接方式发起审核前，需要先保存平台类型、实例地址与访问令牌。粘贴变更方式无需配置。"
          />
        )}

        {actionError ? (
          <InlineError className="settings-alert" title="平台配置操作失败" message={actionError} />
        ) : null}
        {error && settings ? (
          <Alert className="settings-alert" type="warning" showIcon message={`配置读取失败：${error}`} />
        ) : null}

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          className="settings-form"
          onFinish={(values) => void handleSave(values)}
        >
          <Form.Item
            name="platform"
            label="平台类型"
            rules={[{ required: true, message: '请选择平台类型' }]}
          >
            <Select options={PLATFORM_OPTIONS} placeholder="选择代码托管平台" />
          </Form.Item>

          <Form.Item
            name="baseUrl"
            label="实例地址"
            extra="只填协议、主机与端口，例如 https://github.com 或 https://gitlab.example.com。"
            rules={[
              {
                validator: (_rule, value: string) => {
                  const problem = validateBaseUrl(value ?? '');
                  return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
                },
              },
            ]}
          >
            <Input placeholder={defaultBaseUrl(platform)} allowClear />
          </Form.Item>

          <Form.Item
            name="token"
            label="访问令牌"
            extra={
              settings?.configured
                ? `已保存的令牌 ${settings.tokenHint ?? '****'}，留空表示保持不变。`
                : '首次配置必须填写访问令牌，令牌只保存在本机服务端。'
            }
          >
            <Input.Password
              placeholder={settings?.configured ? '留空表示保留现有令牌' : '粘贴平台访问令牌'}
              autoComplete="new-password"
            />
          </Form.Item>

          <div className="settings-actions">
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              保存配置
            </Button>
            <Popconfirm
              title="清除平台凭证？"
              description="清除后 MR 链接方式将无法拉取变更，需重新配置。"
              okText="清除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => void handleClear()}
              disabled={!settings?.configured}
            >
              <Button danger icon={<ClearOutlined />} loading={clearing} disabled={!settings?.configured}>
                清除凭证
              </Button>
            </Popconfirm>
            <Button icon={<ReloadOutlined />} onClick={handleReload}>
              重新读取
            </Button>
          </div>
        </Form>

        <Typography.Paragraph className="settings-note" type="secondary">
          凭证保存在本机数据目录（文件权限 0600），接口只返回末 4 位掩码，不会回传或展示令牌原文。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}