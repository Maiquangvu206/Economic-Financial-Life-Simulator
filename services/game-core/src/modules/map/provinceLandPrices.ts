import type { ProvinceMapNode } from '@efls/domain';

const DEFAULT_PRICE_BY_ZONE: Record<ProvinceMapNode['zone'], number> = {
  commercial: 120_000_000,
  residential: 45_000_000,
  industrial: 25_000_000,
  civic: 80_000_000,
  port: 60_000_000,
  slum: 12_000_000,
  park: 0,
  water: 0,
};

export function defaultProvinceLandPrice(zone: ProvinceMapNode['zone']): number {
  return DEFAULT_PRICE_BY_ZONE[zone] ?? 0;
}
