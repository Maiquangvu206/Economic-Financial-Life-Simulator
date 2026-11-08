import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhaserGame } from '../game/PhaserGame';
import { StatCard } from '../shared/ui/StatCard';
import { Panel } from '../shared/ui/Panel';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { type CharacterDto } from '@efls/contracts';

export function CityPage() {
  const { data: character, isLoading } = useQuery<CharacterDto>({
    queryKey: ['characters', 'me'],
    queryFn: () => apiRequest<CharacterDto>('/api/v1/characters/me'),
  });

  const handleSelectPlot = useCallback((plotId: string) => {
    console.info('[city] selected plot', plotId);
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải thành phố...</p>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <p>Chưa có nhân vật. Vui lòng tạo nhân vật.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight">Thành phố trung tâm</h1>
          <p className="mt-1 text-sm text-slate-600">
            Bản đồ 2D do Phaser render. Mọi thay đổi vị trí và giao dịch đất đều do server xác thực.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600">
          Tick kế tiếp: 23:59:59
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tiền mặt"
          value={formatMoney(character.netWorth.amount)}
          hint="Ví cá nhân"
          tone="positive"
        />
        <StatCard
          label="Tài sản ròng"
          value={formatMoney(character.netWorth.amount)}
          hint="Tổng tài sản − tổng nợ"
        />
        <StatCard
          label="Credit Score"
          value={character.creditScore}
          hint={character.creditScore >= 700 ? 'Tốt' : 'Cần cải thiện'}
        />
        <StatCard
          label="Heat Level"
          value={`${character.heatLevel} / 100`}
          hint="Mức truy nã ngầm"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PhaserGame onSelectPlot={handleSelectPlot} />
        <aside className="space-y-3">
          <Panel title="Nhân vật đang chơi" borderColor="emerald">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Họ tên</span>
                <span className="font-semibold">{character.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Tuổi</span>
                <span>{character.age} tuổi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Sức khỏe / Năng lượng</span>
                <span>{character.healthEnergy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Vị trí</span>
                <span>
                  ({character.location.x}, {character.location.y})
                </span>
              </div>
            </div>
          </Panel>
          <div className="panel">
            <h2 className="panel-title">Sự kiện gần đây</h2>
            <ul className="mt-2 space-y-2 text-xs text-slate-500">
              <li>Chưa có sự kiện trong phiên chơi này.</li>
              <li>Tin vĩ mô và tin phố sẽ xuất hiện tại đây.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
