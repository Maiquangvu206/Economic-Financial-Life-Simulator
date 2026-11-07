import { useCallback } from 'react';
import { PhaserGame } from '../game/PhaserGame';
import { StatCard } from '../shared/ui/StatCard';
import { formatMoney } from '../shared/lib/format';

export function CityPage() {
  const handleSelectPlot = useCallback((plotId: string) => {
    // Later: query plot details and open the property panel.
    console.info('[city] selected plot', plotId);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Thành phố trung tâm</h1>
          <p className="mt-1 text-sm text-slate-400">
            Bản đồ 2D do Phaser render. Mọi thay đổi vị trí và giao dịch đất đều do server xác thực.
          </p>
        </div>
        <div className="rounded-full border border-slate-800 px-3 py-1 text-[11px] text-slate-400">
          Tick kế tiếp: 23:59:59
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tiền mặt" value={formatMoney(0)} hint="Ví cá nhân" />
        <StatCard label="Dòng tiền / năm" value={formatMoney(0)} tone="positive" />
        <StatCard label="Nợ hiện tại" value={formatMoney(0)} tone="negative" />
        <StatCard label="Heat Level" value="0 / 100" hint="Mức truy nã ngầm" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PhaserGame onSelectPlot={handleSelectPlot} />
        <aside className="space-y-3">
          <div className="panel">
            <h2 className="panel-title">Ô đất đang chọn</h2>
            <p className="mt-2 text-xs text-slate-500">
              Chọn một ô trên bản đồ để xem giá đất, chủ sở hữu, quy hoạch và trạng thái thế chấp.
            </p>
          </div>
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
