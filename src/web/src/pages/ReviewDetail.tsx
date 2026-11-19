import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircleFilled,
  LinkOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, App as AntdApp, Button, Card, Result, Segmented, Skeleton, Space, Spin, Tag, Typography } from 'antd';
import { fetchReview, retryReview } from '../api/client';
import { describeError, ERROR_HINTS } from '../api/messages';
import type { ReviewDetail as ReviewDetailData, ReviewFinding, Severity } from '../api/types';
import { EmptyState } from '../components/EmptyState';
import { FindingCard } from '../components/FindingCard';
import { InlineError } from '../components/InlineError';
import { SeverityFilter, type SeverityFilterValue } from '../components/SeverityFilter';
import { SeverityTag, severityName } from '../components/SeverityTag';
import { StatusTag } from '../components/StatusTag';
import { usePolling } from '../hooks/usePolling';
import { formatChangeSummary, formatDateTimeFull, formatSourceTitle } from '../utils/format';
import { navigate } from '../app/router';

type GroupMode = 'severity' | 'file';

interface ReviewDetailProps {
  reviewId: string;
  /** 记录状态变化后同步刷新左侧列表。 */
  onRecordChanged: () => void;
}

const POLL_INTERVAL_MS = 1500;
const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];

/**
 * 记录详情：整体结论、状态、问题清单（级别筛选 / 按文件聚合）与失败重试。
 * 进行中每 1.5 秒刷新一次，进入终态后停止；结果只以服务端返回为准。
 */
export function ReviewDetail({ reviewId, onRecordChanged }: ReviewDetailProps) {
  const { message } = AntdApp.useApp();
  const [detail, setDetail] = useState<ReviewDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; code: string | null } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [severity, setSeverity] = useState<SeverityFilterValue>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('severity');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const next = await fetchReview(reviewId);
        setDetail(next);
        setRefreshError(null);
        setLoadError(null);
      } catch (caught) {
        const info = describeError(caught);
        if (silent) setRefreshError(info.message);
        else setLoadError({ message: info.message, code: info.code });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [reviewId],
  );

  useEffect(() => {
    setDetail(null);
    setSeverity('all');
    setGroupMode('severity');
    setActionError(null);
    setRefreshError(null);
    void load(false);
  }, [load]);

  const running = detail?.status === 'running';
  usePolling(() => load(true), POLL_INTERVAL_MS, running);

  const status = detail?.status ?? null;
  useEffect(() => {
    if (status) onRecordChanged();
    // 仅在状态变化时同步列表，避免每次轮询都触发刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const findings = detail?.findings ?? [];

  const counts = useMemo<Record<Severity, number>>(
    () => ({
      high: findings.filter((finding) => finding.severity === 'high').length,
      medium: findings.filter((finding) => finding.severity === 'medium').length,
      low: findings.filter((finding) => finding.severity === 'low').length,
    }),
    [findings],
  );

  const visibleFindings = useMemo(
    () => (severity === 'all' ? findings : findings.filter((finding) => finding.severity === severity)),
    [findings, severity],
  );

  const severityGroups = useMemo(
    () =>
      SEVERITY_ORDER.map((level) => ({
        severity: level,
        items: visibleFindings.filter((finding) => finding.severity === level),
      })).filter((group) => group.items.length > 0),
    [visibleFindings],
  );

  const fileGroups = useMemo(() => {
    const grouped = new Map<string, ReviewFinding[]>();
    for (const finding of visibleFindings) {
      const bucket = grouped.get(finding.file);
      if (bucket) bucket.push(finding);
      else grouped.set(finding.file, [finding]);
    }
    return Array.from(grouped, ([file, items]) => ({ file, items }));
  }, [visibleFindings]);

  const handleRetry = async () => {
    setRetrying(true);
    setActionError(null);
    try {
      const next = await retryReview(reviewId);
      setDetail(next);
      setRefreshError(null);
      setSeverity('all');
      setGroupMode('severity');
      message.success('已重新发起审核，正在自动跟进结果');
      onRecordChanged();
    } catch (caught) {
      setActionError(describeError(caught).message);
    } finally {
      setRetrying(false);
    }
  };

  if (loading && !detail) {
    return (
      <Card className="surface-card">
        <Skeleton active title paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (loadError && !detail) {
    const notFound = loadError.code === 'NOT_FOUND';
    return (
      <Card className="surface-card">
        <Result
          status="warning"
          title={notFound ? '记录不存在或已删除' : '记录加载失败'}
          subTitle={loadError.message}
          extra={
            <Space>
              <Button type="primary" icon={<ReloadOutlined />} onClick={() => void load(false)}>
                重新加载
              </Button>
              {notFound ? <Button onClick={() => navigate('/history')}>返回审核历史</Button> : null}
            </Space>
          }
        />
      </Card>
    );
  }

  if (!detail) return null;

  const totalIssues = detail.conclusion?.totalIssues ?? findings.length;
  const highSeverityCount = detail.conclusion?.highSeverityCount ?? counts.high;
  const findingIndex = (finding: ReviewFinding) => findings.findIndex((item) => item.id === finding.id) + 1;

  return (
    <Card className="surface-card detail-card">
      <div className="detail-head">
        <div className="detail-head__info">
          <Space size={8} wrap>
            <StatusTag status={detail.status} />
            <Tag className="soft-tag" style={{ marginInlineEnd: 0 }}>
              {detail.source.type === 'mr-link' ? 'MR 链接' : '粘贴变更'}
            </Tag>
            {detail.attempts > 1 ? (
              <Tag className="soft-tag" style={{ marginInlineEnd: 0 }}>
                第 {detail.attempts} 次审核
              </Tag>
            ) : null}
          </Space>
          <h2 className="detail-title" title={formatSourceTitle(detail.source)}>
            {formatSourceTitle(detail.source)}
          </h2>
          <div className="detail-meta">
            <span>发起于 {formatDateTimeFull(detail.createdAt)}</span>
            {detail.finishedAt ? <span>完成于 {formatDateTimeFull(detail.finishedAt)}</span> : null}
            <span>{formatChangeSummary(detail.changeSummary)}</span>
          </div>
          {detail.source.url ? (
            <Typography.Link href={detail.source.url} target="_blank" rel="noreferrer" className="detail-link">
              <LinkOutlined /> 打开合并请求
            </Typography.Link>
          ) : null}
        </div>

        <div className="detail-head__actions">
          {detail.status === 'failed' ? (
            <Button type="primary" icon={<ReloadOutlined />} loading={retrying} onClick={() => void handleRetry()}>
              重新发起审核
            </Button>
          ) : null}
        </div>
      </div>

      {refreshError ? (
        <Alert className="detail-soft-alert" type="warning" showIcon message={`自动刷新失败：${refreshError}`} />
      ) : null}
      {actionError ? (
        <InlineError className="detail-soft-alert" title="重新发起失败" message={actionError} />
      ) : null}

      {detail.status === 'running' ? (
        <div className="state-block state-block--running">
          <Spin size="large" />
          <div>
            <div className="state-block__title">审核进行中</div>
            <p className="state-block__desc">
              正在逐条分析变更内容，页面每 1.5 秒自动刷新，完成后自动展示结果；可直接离开本页，稍后回到审核历史查看。
            </p>
          </div>
        </div>
      ) : null}

      {detail.status === 'failed' ? (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          className="failure-alert"
          message="本次审核失败"
          description={
            <div className="failure">
              <div className="failure__message">{detail.failure?.message || failureHint(detail.failure?.code)}</div>
              {detail.failure?.code ? <div className="failure__code">错误码：{detail.failure.code}</div> : null}
              <div className="failure__note">该记录已保留在审核历史中，可排除原因后重新发起审核。</div>
            </div>
          }
        />
      ) : null}

      {detail.status === 'succeeded' ? (
        <>
          {totalIssues === 0 ? (
            <div className="conclusion conclusion--clean">
              <CheckCircleFilled className="conclusion__icon" />
              <div>
                <div className="conclusion__title">未发现问题</div>
                <p className="conclusion__desc">本次审核未在变更中发现问题，仍建议在合并前做一次人工复核。</p>
              </div>
            </div>
          ) : (
            <div className="conclusion">
              <div className="conclusion__metric">
                <span className="conclusion__value">{totalIssues}</span>
                <span className="conclusion__label">个问题</span>
              </div>
              <div className="conclusion__metric conclusion__metric--high">
                <span className="conclusion__value">{highSeverityCount}</span>
                <span className="conclusion__label">高严重级</span>
              </div>
              <p className="conclusion__text">
                {highSeverityCount > 0
                  ? '存在高严重级问题，建议修复后再合并。'
                  : '未发现高严重级问题，可结合建议逐条确认。'}
              </p>
            </div>
          )}

          {findings.length > 0 ? (
            <>
              <div className="list-toolbar">
                <SeverityFilter
                  value={severity}
                  total={totalIssues}
                  counts={counts}
                  onChange={setSeverity}
                />
                <Segmented
                  className="group-switch"
                  value={groupMode}
                  onChange={(value) => setGroupMode(value as GroupMode)}
                  options={[
                    { label: '按级别', value: 'severity' },
                    { label: '按文件', value: 'file' },
                  ]}
                />
              </div>

              {visibleFindings.length === 0 ? (
                <EmptyState title="该级别下没有问题" description="切换严重级别筛选查看其它问题。" />
              ) : groupMode === 'severity' ? (
                <div className="finding-groups">
                  {severityGroups.map((group) => (
                    <section className="finding-group" key={group.severity}>
                      <div className="finding-group__head">
                        <SeverityTag severity={group.severity} />
                        <span className="finding-group__title">{severityName(group.severity)}</span>
                        <span className="finding-group__count">{group.items.length} 条</span>
                      </div>
                      <div className="finding-group__body">
                        {group.items.map((finding) => (
                          <FindingCard key={finding.id} finding={finding} index={findingIndex(finding)} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="finding-groups">
                  {fileGroups.map((group) => (
                    <section className="finding-group" key={group.file}>
                      <div className="finding-group__head">
                        <span className="finding-group__file" title={group.file}>
                          {group.file}
                        </span>
                        <span className="finding-group__count">{group.items.length} 条</span>
                      </div>
                      <div className="finding-group__body">
                        {group.items.map((finding) => (
                          <FindingCard key={finding.id} finding={finding} index={findingIndex(finding)} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function failureHint(code: string | undefined): string {
  if (code && ERROR_HINTS[code]) return ERROR_HINTS[code];
  return '审核失败，可重新发起审核';
}