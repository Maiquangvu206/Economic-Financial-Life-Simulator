import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { ZoneTypeSchema } from '../enums/index.js';

export const MapRoadTypeSchema = z.enum(['highway', 'arterial', 'local', 'bridge', 'none']);
export type MapRoadType = z.infer<typeof MapRoadTypeSchema>;

/** Một ô trên bản đồ 2D (ánh xạ 1-1 với hàng trong map_nodes). */
export const MapNodeDtoSchema = z.object({
  id: IdSchema,
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  zoneType: ZoneTypeSchema,
  name: z.string(),
  /** Giá đất theo m², đơn vị minor (VNĐ). 0 = không bán/đất công cộng. */
  landPriceMinor: z.number().int().nonnegative(),
});
export type MapNodeDto = z.infer<typeof MapNodeDtoSchema>;

export const MapRoadDtoSchema = z.object({
  nodeId: IdSchema,
  roadType: MapRoadTypeSchema,
});
export type MapRoadDto = z.infer<typeof MapRoadDtoSchema>;

export const MapMetaDtoSchema = z.object({
  version: z.number().int().nonnegative(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
export type MapMetaDto = z.infer<typeof MapMetaDtoSchema>;

export const MapDtoSchema = z.object({
  nodes: z.array(MapNodeDtoSchema),
  roads: z.array(MapRoadDtoSchema),
  meta: MapMetaDtoSchema,
});
export type MapDto = z.infer<typeof MapDtoSchema>;

/** Yêu cầu cập nhật một ô (dùng cho chỉnh sửa bản đồ quản trị). */
export const UpdateMapNodeRequestSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  zoneType: ZoneTypeSchema.optional(),
  landPriceMinor: z.number().int().nonnegative().optional(),
  name: z.string().optional(),
});
export type UpdateMapNodeRequest = z.infer<typeof UpdateMapNodeRequestSchema>;

export const SetMapRoadRequestSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  roadType: MapRoadTypeSchema,
});
export type SetMapRoadRequest = z.infer<typeof SetMapRoadRequestSchema>;

/** PUT /api/v1/map — quản trị viên lưu bản đồ, xử lý đồng thời theo phiên bản. */
export const PutMapRequestSchema = z.object({
  version: z.number().int().nonnegative(),
  nodes: z.array(UpdateMapNodeRequestSchema).optional(),
  roads: z.array(SetMapRoadRequestSchema).optional(),
});
export type PutMapRequest = z.infer<typeof PutMapRequestSchema>;

export const PutMapResponseSchema = z.object({
  version: z.number().int().nonnegative(),
});
export type PutMapResponse = z.infer<typeof PutMapResponseSchema>;
