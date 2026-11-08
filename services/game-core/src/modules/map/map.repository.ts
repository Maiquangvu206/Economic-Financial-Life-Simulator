import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface MapNodeRow {
  id: string;
  x: number;
  y: number;
  zoneType: string;
  name: string;
  landPriceMinor: string;
}

export interface MapRoadRow {
  nodeId: string;
  roadType: string;
}

export interface MapMetaRow {
  version: number;
  cols: number;
  rows: number;
}

interface MapNodeInput {
  x: number;
  y: number;
  zoneType: string;
  landPriceMinor: number;
  name: string;
}

export interface MapRoadInput {
  nodeId: string;
  roadType: string;
}

/** Truy cập dữ liệu bản đồ: map_nodes, map_roads, map_meta. */
export class MapRepository {
  constructor(readonly db: Db = pool) {}

  async getMap(): Promise<{
    nodes: MapNodeRow[];
    roads: MapRoadRow[];
    meta: MapMetaRow;
  }> {
    const [nodesResult, roadsResult, metaResult] = await Promise.all([
      this.db.query<MapNodeRow>(
        `SELECT id, x, y, zone_type AS "zoneType", name,
                land_price_minor AS "landPriceMinor"
         FROM map_nodes ORDER BY x, y`,
      ),
      this.db.query<MapRoadRow>(
        `SELECT node_id AS "nodeId", road_type AS "roadType" FROM map_roads`,
      ),
      this.db.query<MapMetaRow>(`SELECT version, cols, rows FROM map_meta WHERE id = 1`),
    ]);

    const meta = metaResult.rows[0];
    if (!meta) {
      throw new Error('Map metadata is missing');
    }

    return { nodes: nodesResult.rows, roads: roadsResult.rows, meta };
  }

  /** Cập nhật (hoặc chèn nếu chưa có) danh sách ô bản đồ theo tọa độ (x, y). */
  async upsertNodes(db: Db, nodes: MapNodeInput[]): Promise<void> {
    for (const n of nodes) {
      await db.query(
        `INSERT INTO map_nodes (id, x, y, zone_type, name, land_price_minor)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
         ON CONFLICT (x, y) DO UPDATE
         SET zone_type = EXCLUDED.zone_type,
             name = EXCLUDED.name,
             land_price_minor = EXCLUDED.land_price_minor,
             updated_at = now()`,
        [n.x, n.y, n.zoneType, n.name, n.landPriceMinor],
      );
    }
  }

  /** Thay thế toàn bộ đường giao thông theo danh sách ô được chỉ định. */
  async replaceRoads(db: Db, roads: MapRoadInput[]): Promise<void> {
    await db.query(`DELETE FROM map_roads`);
    for (const r of roads) {
      if (r.roadType === 'none') continue;
      await db.query(
        `INSERT INTO map_roads (id, node_id, road_type)
         VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT (node_id) DO UPDATE
         SET road_type = EXCLUDED.road_type,
             updated_at = now()`,
        [r.nodeId, r.roadType],
      );
    }
  }

  /** Lấy phiên bản hiện tại của bản đồ. */
  async getVersion(db: Db): Promise<number> {
    const result = await db.query<{ version: number }>(`SELECT version FROM map_meta WHERE id = 1`);
    return result.rows[0]?.version ?? 0;
  }

  /** Tăng phiên bản bản đồ và trả về phiên bản mới. */
  async bumpVersion(db: Db): Promise<number> {
    const result = await db.query<{ version: number }>(
      `UPDATE map_meta SET version = version + 1, updated_at = now()
       WHERE id = 1 RETURNING version`,
    );
    if (!result.rows[0]) throw new Error('Map metadata is missing');
    return result.rows[0].version;
  }

  /** Ánh xạ tọa độ (x, y) sang id nút bản đồ. */
  async nodeIdByCoord(db: Db): Promise<Map<string, string>> {
    const result = await db.query<{ id: string; x: number; y: number }>(
      `SELECT id, x, y FROM map_nodes`,
    );
    const map = new Map<string, string>();
    for (const row of result.rows) map.set(`${row.x}-${row.y}`, row.id);
    return map;
  }
}

export const mapRepository = new MapRepository();
