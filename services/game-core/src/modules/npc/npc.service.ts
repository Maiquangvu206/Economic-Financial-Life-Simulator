import { evaluateNpcDeal } from '@efls/domain';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { callAiService } from '../../shared/ai/aiClient.js';
import { notify } from '../notifications/notification.service.js';
import {
  type NpcNegotiateRequest,
  type NpcNegotiateResponse,
  type NpcNegotiationDto,
  MoneySchema,
} from '@efls/contracts';
import { npcRepository } from './npc.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

interface NpcProposalRaw {
  dialogue?: string;
  accept?: boolean;
  counter_offer?: number | null;
  mood_delta?: number;
}

/** Dịch vụ đàm phán NPC theo tính cách: AI đề xuất dialogue, core chốt accept/counter theo rule. */
export class NpcService {
  constructor(private readonly repository = npcRepository) {}

  async negotiate(userId: string, input: NpcNegotiateRequest): Promise<NpcNegotiateResponse> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);

      // AI đề xuất dialogue/tope (advisory). Fallback dialogue mặc định nếu AI lỗi.
      const { data } = await callAiService<NpcProposalRaw>('/v1/npc/negotiate', {
        npc_id: input.npcId,
        personality: input.personality,
        context: input.context,
        player_offer: input.playerOffer,
        fair_value: input.fairValue,
      });
      const dialogue =
        data?.dialogue ??
        (input.personality === 'greedy'
          ? 'Giá này quá thấp, tôi cần thêm.'
          : input.personality === 'honest'
            ? 'Tôi sẽ cân nhắc đề xuất của bạn.'
            : 'Để tôi suy nghĩ thêm.');

      // Core chốt bằng rule theo tính cách (deterministic).
      const rule = evaluateNpcDeal({
        personality: input.personality,
        offerMinor: input.offerMinor,
        fairValue: input.fairValue,
      });

      const id = await this.repository.insertNegotiation(
        client,
        character.id,
        input.npcId,
        input.personality,
        input.context,
        input.playerOffer,
        input.fairValue,
        dialogue,
        rule.accept,
        rule.counterOfferMinor,
        rule.moodDelta,
      );

      await notify(client, {
        userId,
        kind: 'npc',
        title: 'Đàm phán NPC',
        body: rule.accept
          ? `${input.npcId} đã chấp nhận đề xuất của bạn.`
          : `${input.npcId} từ chối, counter ${rule.counterOfferMinor?.toLocaleString('vi-VN')} ₫.`,
        payload: { negotiationId: id, accept: rule.accept },
      });

      return {
        proposalId: id,
        dialogue,
        accept: rule.accept,
        counterOfferMinor: rule.counterOfferMinor,
        moodDelta: rule.moodDelta,
        offerMinor: input.offerMinor,
        personality: input.personality,
      };
    });
  }

  async listHistory(userId: string): Promise<NpcNegotiationDto[]> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const rows = await this.repository.listHistory(character.id, db);
    return rows.map((r) => ({
      id: r.id,
      npcId: r.npcId,
      personality: r.personality as NpcNegotiationDto['personality'],
      dialogue: r.dialogue,
      accept: r.accept,
      counterOffer: r.counterOfferMinor ? money(Number(r.counterOfferMinor)) : null,
      moodDelta: Number(r.moodDelta),
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

export const npcService = new NpcService();
