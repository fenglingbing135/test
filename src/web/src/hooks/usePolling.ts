import { useEffect, useRef } from 'react';

/**
 * 顺序触发的轮询：上一次任务结束后再等待 `intervalMs` 执行下一次，避免请求叠加；
 * `enabled` 为 false 时停止（用于审核进入终态后停止刷新）。
 */
export function usePolling(task: () => void | Promise<void>, intervalMs: number, enabled: boolean): void {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      try {
        await taskRef.current();
      } finally {
        if (!cancelled) timer = window.setTimeout(tick, intervalMs);
      }
    };

    timer = window.setTimeout(tick, intervalMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, intervalMs]);
}