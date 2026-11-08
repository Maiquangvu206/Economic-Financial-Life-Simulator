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
   * Trả về toàn bộ bản đồ (nút, đường, phiên bản) để render ở phía người chơi.
   * - Không tham số / province=001: bản đồ Hà Nội lưu trong DB (có BĐS, editor chỉnh sửa).
   * - province khác: bản đồ địa giới sinh động theo mã tỉnh (không lưu DB).
   */
  async getMap(provinceCode?: string) {
    const code = provinceCode ?? '001';
    if (code !== '001') {
      if (!provinceByCode(code)) {
        throw AppError.badRequest('Mã tỉnh không hợp lệ.');
      }
      const generated = generateProvinceMap(code);
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
          landPriceMinor: 0,
        })),
        roads: generated.roads.map((r) => ({
          nodeId: nodeIdByCoord.get(`${r.x}-${r.y}`)!,
          roadType: r.roadType,
        })),
        meta: { version: 0, cols: generated.cols, rows: generated.rows },
        provinceCode: code,
        provinceName: generated.name,
      };
    }
    const map = await this.repository.getMap();
    return { ...map, provinceCode: '001', provinceName: 'Thành phố Hà Nội' };
  }

  /**
   * Lưu bản đồ (quản trị viên). Phải gọi bên trong giao dịch để xử lý đồng thời:
   * phiên bản yêu cầu phải khớp phiên bản hiện tại, nếu không → 409 Conflict.
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
      throw AppError.forbidden('Chỉ quản trị viên hoặc điều hành viên được chỉnh sửa bản đồ');
    }

    return withTransaction(async (client) => {
      const currentVersion = await this.repository.getVersion(client);
      if (currentVersion !== input.version) {
        throw AppError.conflict(
          'version_mismatch',
          `Bản đồ đã được cập nhật (phiên bản ${currentVersion}). Vui lòng tải lại bản đồ và thử lại.`,
        );
      }

      const nodes = input.nodes ?? [];
      await this.repository.upsertNodes(
        client,
        nodes.map((n) => ({
          x: n.x,
          y: n.y,
          zoneType: n.zoneType ?? 'residential',
          landPriceMinor: n.landPriceMinor ?? 0,
          name: n.name ?? `Ô [${n.x},${n.y}]`,
        })),
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
