import { describe, expect, it } from 'vitest';
import {
  clusterContaining,
  clusterTier,
  constructionOptionsFor,
  findOwnedClusters,
  projectedValue,
} from './construction.js';

describe('construction merging', () => {
  it('groups 4 adjacent tiles into a 2x2 large cluster', () => {
    const clusters = findOwnedClusters([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.size).toBe(4);
    expect(clusters[0]!.tier).toBe('large');
    expect(clusterContaining(clusters, 5, 6)!.size).toBe(4);
  });

  it('keeps diagonal tiles in separate clusters', () => {
    const clusters = findOwnedClusters([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.tier === 'single')).toBe(true);
  });

  it('offers larger projects only when the cluster is big enough', () => {
    expect(
      constructionOptionsFor({ cells: [{ x: 0, y: 0 }], size: 1, tier: 'single' }).map((o) => o.id),
    ).toEqual(['house4', 'shop', 'garage', 'company_hq']);
    const small = {
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      size: 2,
      tier: 'small' as const,
    };
    // Khách sạn boutique cần 3 ô → khối 2 ô chỉ thấy chung cư mini + trụ sở công ty.
    expect(constructionOptionsFor(small).map((o) => o.id)).toEqual(['mini-apartment', 'company_hq']);
    const large = findOwnedClusters([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ])[0]!;
    expect(large.tier).toBe('large');
    expect(constructionOptionsFor(large).map((o) => o.id)).toEqual([
      'shopping-center',
      'office-tower',
      'company_hq',
    ]);
  });

  it('classifies tiers and projects values by multiplier', () => {
    expect(clusterTier(1)).toBe('single');
    expect(clusterTier(3)).toBe('small');
    expect(clusterTier(4)).toBe('large');
    expect(projectedValue(100_000_000, 4)).toBe(400_000_000);
  });
});
