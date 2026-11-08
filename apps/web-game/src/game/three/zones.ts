import type { ZoneType } from '../map/MapData';

/**
 * Bảng màu pastel đồng bộ với Phaser TerrainLayer (2D):
 * dân cư xanh lá mạ, thương mại xanh trời, công nghiệp vàng, chính trị tím,
 * cảng cyan, xóm liều xám, sông nước xanh nhạt, công viên mint.
 */
export const ZONE_COLORS: Record<ZoneType, string> = {
  residential: '#d1fae5',
  commercial: '#dbeafe',
  industrial: '#fef3c7',
  civic: '#ede9fe',
  port: '#cffafe',
  slum: '#e2e8f0',
  water: '#bae6fd',
  park: '#ccfbf1',
};

/** Độ cao khối 3D theo vùng (địa hình nổi). Nước phẳng ở mức 0. */
export const ZONE_HEIGHT: Record<ZoneType, number> = {
  commercial: 0.6,
  civic: 0.45,
  residential: 0.3,
  industrial: 0.22,
  park: 0.18,
  slum: 0.15,
  port: 0.08,
  water: 0.05,
};
