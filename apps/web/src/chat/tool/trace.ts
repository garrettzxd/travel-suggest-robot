import type { Attraction, ToolName } from '@travel/shared';
import type { ToolTraceEntry } from '../types';

/**
 * 将最近一个同名运行中工具标记为完成，找不到时补一条完成记录。
 * 从后往前匹配，避免并行工具或重复工具名时更新到更早的调用记录。
 * @param entries 当前工具轨迹列表
 * @param payload tool_end 事件载荷
 */
export function markToolDone(
  entries: ToolTraceEntry[],
  payload: { name: ToolName; result: unknown },
): ToolTraceEntry[] {
  const next = [...entries];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const entry = next[index];
    if (entry?.name === payload.name && entry.status === 'running') {
      next[index] = { ...entry, status: 'done', result: payload.result };
      return next;
    }
  }
  next.push({ name: payload.name, status: 'done', result: payload.result });
  return next;
}

/**
 * 把所有 running 状态的工具刷成 error，用于流异常或 error 事件兜底。
 * @param entries 当前工具轨迹列表
 */
export function markRunningToolsAsError(entries: ToolTraceEntry[]): ToolTraceEntry[] {
  return entries.map((entry) =>
    entry.status === 'running' ? { ...entry, status: 'error' } : entry,
  );
}

/**
 * 把 getAttractions 工具结果（可能是 JSON 字符串或已反序列化数组）归一成 Attraction[]。
 * @param result tool_end.result 字段
 */
export function normalizeAttractionsResult(result: unknown): Attraction[] | undefined {
  if (Array.isArray(result)) return result as Attraction[];
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) return parsed as Attraction[];
    } catch {
      // 忽略：解析失败按未拿到结构化数据处理。
    }
  }
  return undefined;
}
