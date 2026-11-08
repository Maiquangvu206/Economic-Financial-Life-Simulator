import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { mapRepository, type MapRoadInput } from './map.repository.js';
import type { PutMapRequest, PutMapResponse } from '@efls/contracts';

/** Dịch vụ bản đồ: cung cấp bản đồ cho người chơi và cho phép quản trị viên chỉnh sửa. */
export class MapService {
  constructor(private readonly repository = mapRepository) {}

  /** Trả về toàn bộ bản đồ (nút, đường, phiên bản) để render ở phía người chơi. */
  async getMap() {
    return this.repository.getMap();
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
