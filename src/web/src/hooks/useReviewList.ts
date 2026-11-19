import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchReviews } from '../api/client';
import { describeError } from '../api/messages';
import type { ReviewListItem } from '../api/types';
import { usePolling } from './usePolling';

export interface ReviewListState {
  /** 首次加载完成前为 null，用于区分骨架屏与真实空态。 */
  items: ReviewListItem[] | null;
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  removeLocal: (reviewId: string) => void;
}

const LIST_LIMIT = 200;
const POLL_INTERVAL_MS = 1500;

/**
 * 审核记录列表：服务端是唯一权威，列表轮询只在存在进行中记录时启用。
 */
export function useReviewList(): ReviewListState {
  const [items, setItems] = useState<ReviewListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await fetchReviews({ limit: LIST_LIMIT });
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasRunning = (items ?? []).some((item) => item.status === 'running');
  usePolling(refresh, POLL_INTERVAL_MS, hasRunning);

  const removeLocal = useCallback((reviewId: string) => {
    setItems((previous) => (previous ? previous.filter((item) => item.id !== reviewId) : previous));
    setTotal((previous) => Math.max(0, previous - 1));
  }, []);

  return {
    items,
    total,
    loading: items === null && error === null,
    error,
    refresh,
    removeLocal,
  };
}