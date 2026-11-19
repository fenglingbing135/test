/** 与服务端接口一致的字段类型（来源：docs/wi-t1000011/technical-contract.md）。 */

export type ReviewStatus = 'running' | 'succeeded' | 'failed';
export type SourceType = 'paste' | 'mr-link';
export type Severity = 'high' | 'medium' | 'low';
export type Platform = 'github' | 'gitlab';

export interface ReviewSource {
  type: SourceType;
  url: string | null;
  platform: Platform | null;
  repository: string | null;
  number: number | null;
}

export interface ReviewFinding {
  id: string;
  file: string;
  location: string;
  snippet: string | null;
  severity: Severity;
  message: string;
  suggestion: string;
}

export interface ReviewConclusion {
  totalIssues: number;
  highSeverityCount: number;
}

export interface ReviewFailure {
  code: string;
  message: string;
}

export interface ChangeSummary {
  filesChanged: number;
  additions: number;
  deletions: number;
}

/** `GET /api/reviews/:reviewId` 与创建、重试接口的响应。 */
export interface ReviewDetail {
  id: string;
  status: ReviewStatus;
  source: ReviewSource;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  changeSummary: ChangeSummary;
  conclusion: ReviewConclusion | null;
  findings: ReviewFinding[];
  failure: ReviewFailure | null;
}

/** `GET /api/reviews` 的列表项摘要。 */
export interface ReviewListItem {
  id: string;
  status: ReviewStatus;
  sourceType: SourceType;
  sourceLabel: string;
  createdAt: string;
  issueCount: number | null;
  highSeverityCount: number | null;
}

export interface ReviewListResponse {
  total: number;
  items: ReviewListItem[];
}

export interface ReviewListQuery {
  status?: ReviewStatus;
  limit?: number;
  offset?: number;
}

/** `POST /api/reviews` 请求体，两种模式互斥。 */
export type CreateReviewInput = { mode: 'paste'; diffText: string } | { mode: 'mr-link'; url: string };

/** `GET/PUT /api/settings/platform` 的响应（令牌永不回传原文）。 */
export interface PlatformSettings {
  configured: boolean;
  platform: Platform | null;
  baseUrl: string | null;
  tokenHint: string | null;
  updatedAt: string | null;
}

export interface PlatformSettingsInput {
  platform: Platform;
  baseUrl: string;
  token?: string;
}