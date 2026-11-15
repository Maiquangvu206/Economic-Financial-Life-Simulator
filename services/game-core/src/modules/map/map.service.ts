import { generateProvinceMap, provinceByCode } from '@efls/domain';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { mapRepository, type MapRoadInput } from './map.repository.js';
import type { PutMapRequest, PutMapResponse } from '@efls/contracts';

function uuidFromSeed(seed: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i += 1) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const a = hex(h1);
  const b = hex(h2);
  const v = '4' + hex((h1 ^ h2) >>> 0).slice(1, 3);
  const variant = '8' + hex((h1 + h2) >>> 0).slice(1, 3);
  return `${a}-${b.slice(0, 4)}-${v}-${variant}-${hex((h2 ^ h1) >>> 0)}${hex(h1)}`.slice(0, 36);
}

/** Dịch vụ bản đồ: cung cấp bản đồ + cho phép quản trị viên chỉnh sửa. */
export class MapService {
  constructor(private readonly repository = mapRepository) {}

  /**
   * Trả về bản đồ (nút, đường, phiên bản) để render/cấu hình.
   * - province=001 (mặc định): bản đồ Hà Nội lưu trong DB.
   * - province khác: bản đồ sinh động theo tỉnh + overlay cấu hình giá đất đã lưu (nếu có).
   */
  async getMap(provinceCode?: string) {
    const code = (provinceCode ?? '001').trim() || '001';
    if (code !== '001') {
      if (!provinceByCode(code)) {
        throw AppError.badRequest('Mã tỉnh không hợp lệ.');
      }
      const generated = generateProvinceMap(code);
      const [savedPrices, meta] = await Promise.all([
        this.repository.getProvinceLandPrices(this.repository.db, code),
        this.repository.getProvinceMeta(this.repository.db, code),
      ]);
      const nodeIdByCoord = new Map<string, string>();
      for (const n of generated.nodes) {
        nodeIdByCoord.set(`${n.x}-${n.y}`, uuidFromSeed(`${code}:${n.x}:${n.y}`));
      }
      return {
        nodes: generated.nodes.map((n) => ({
          id: nodeIdByCoord.get(`${n.x}-${n.y}`)!,
          x: n.x,
          y: n.y,
          zoneType: n.zone,
          name: n.name,
          landPriceMinor: savedPrices.get(`${n.x}-${n.y}`) ?? 0,
        })),
        roads: generated.roads.map((r) => ({
          nodeId: nodeIdByCoord.get(`${r.x}-${r.y}`)!,
          roadType: r.roadType,
        })),
        meta: { version: meta.version, cols: generated.cols, rows: generated.rows },
        provinceCode: code,
        provinceName: generated.name,
      };
    }
    const map = await this.repository.getMap();
    return { ...map, provinceCode: '001', provinceName: 'Thành phố Hà Nội' };
  }

  /**
   * Lưu cấu hình/bản đồ (quản trị viên). Xử lý đồng thời theo phiên bản (409 nếu lệch).
   * - provinceCode 001/mặc định: lưu bản đồ Hà Nội (map_nodes/map_meta).
   * - provinceCode khác: lưu cấu hình giá đất theo tỉnh (map_province_*), không hiển thị/ghi đè bản đồ.
   */
  async putMap(
    actorId: string | undefined,
    actorRole: string | undefined,
    input: PutMapRequest,
  ): Promise<PutMapResponse> {
    if (!actorId) {
      throw AppError.unauthorized('Missing actor identity');
    }
    if (actorRole !== 'admin' && actorRole !== 'moderator') {
      throw AppError.forbidden('Chỉ quản trị viên hoặc điều hành viên được chỉnh sửa cấu hình bản đồ');
    }

    const code = (input.provinceCode ?? '001').trim() || '001';

    return withTransaction(async (client) => {
      if (code !== '001') {
        if (!provinceByCode(code)) {
          throw AppError.badRequest('Mã tỉnh không hợp lệ.');
        }
        const current = await this.repository.getProvinceMeta(client, code);
        if (current.version !== input.version) {
          throw AppError.conflict(
            'version_mismatch',
            `Cấu hình đã được cập nhật (phiên bản ${current.version}). Vui lòng tải lại và thử lại.`,
          );
        }
        const nodes = (input.nodes ?? [])
          .filter((n) => typeof n.landPriceMinor === 'number')
          .map((n) => ({ x: n.x, y: n.y, landPriceMinor: Math.max(0, Math.floor(n.landPriceMinor!)) }));
        if (nodes.length > 0) {
          await this.repository.upsertProvinceLandPrices(client, code, nodes);
        }
        const newVersion = await this.repository.bumpProvinceVersion(client, code);
        return { version: newVersion };
      }

      const currentVersion = await this.repository.getVersion(client);
      if (currentVersion !== input.version) {
        throw AppError.conflict(
          'version_mismatch',
          `Bản đồ đã được cập nhật (phiên bản ${currentVersion}). Vui lòng tải lại bản đồ và thử lại.`,
        );
      }

      // Giữ nguyên vùng/tên hiện có khi admin chỉ cập nhật giá đất (tránh ghi đè thành residential).
      const existing = await this.repository.getMap();
      const existingByCoord = new Map(existing.nodes.map((n) => [`${n.x}-${n.y}`, n]));

      const nodes = input.nodes ?? [];
      await this.repository.upsertNodes(
        client,
        nodes.map((n) => {
          const prev = existingByCoord.get(`${n.x}-${n.y}`);
          return {
            x: n.x,
            y: n.y,
            zoneType: n.zoneType ?? prev?.zoneType ?? 'residential',
            landPriceMinor: n.landPriceMinor ?? Number(prev?.landPriceMinor ?? 0),
            name: n.name ?? prev?.name ?? `Ô [${n.x},${n.y}]`,
          };
        }),
      );

      const nodeIdByCoord = await this.repository.nodeIdByCoord(client);
      const roads = (input.roads ?? [])
        .map((r) => {
          const nodeId = nodeIdByCoord.get(`${r.x}-${r.y}`);
          return nodeId ? { nodeId, roadType: r.roadType } : null;
        })
        .filter(Boolean) as MapRoadInput[];
      await this.repository.replaceRoads(client, roads);

      const newVersion = await this.repository.bumpVersion(client);
      return { version: newVersion };
    });
  }
}

export const mapService = new MapService();
