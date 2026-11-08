import type { AiMetricsOverviewDto } from '@efls/contracts';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { observabilityRepository } from './observability.repository.js';

/** Dịch vụ quan sát: tổng hợp ai_metrics cho dashboard. */
export class ObservabilityService {
  constructor(private readonly repository = observabilityRepository) {}

  async getAiMetrics(userId: string): Promise<AiMetricsOverviewDto> {
    const db = this.repository.db;
    await requireCharacterByUserId(db, userId);
    const [recent, byTask] = await Promise.all([
      this.repository.listRecent(50),
      this.repository.aggregateByTask(),
    ]);

    const totalCalls = byTask.reduce((sum, t) => sum + Number(t.totalCalls), 0);
    const totalCostUsd = byTask.reduce((sum, t) => sum + Number(t.totalCostUsd), 0);
    const weightedLatency =
      totalCalls > 0
        ? byTask.reduce((sum, t) => sum + Number(t.avgLatencyMs) * Number(t.totalCalls), 0) /
          totalCalls
        : 0;
    const totalErrors = byTask.reduce((sum, t) => sum + Number(t.errors), 0);

    return {
      generate: {
        totalCalls,
        totalCostUsd,
        avgLatencyMs: weightedLatency,
        errorRate: totalCalls > 0 ? totalErrors / totalCalls : 0,
      },
      byTask: byTask.map((t) => ({
        task: t.task as AiMetricsOverviewDto['byTask'][number]['task'],
        totalCalls: Number(t.totalCalls),
        avgLatencyMs: Number(t.avgLatencyMs),
        totalCostUsd: Number(t.totalCostUsd),
        errorRate: Number(t.totalCalls) > 0 ? Number(t.errors) / Number(t.totalCalls) : 0,
      })),
      recent: recent.map((r) => ({
        id: r.id,
        task: r.task as AiMetricsOverviewDto['recent'][number]['task'],
        model: r.model,
        promptVersion: r.promptVersion,
        latencyMs: r.latencyMs,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: Number(r.costUsd),
        status: r.status as 'ok' | 'error',
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async getOutboxPending(): Promise<number> {
    return this.repository.outboxPending();
  }
}

export const observabilityService = new ObservabilityService();
