import { PageHeader } from '@efls/ui';
import { useState } from 'react';

const ZONES = ['residential', 'commercial', 'industrial', 'civic', 'port', 'slum'] as const;
const ZONE_COLOR: Record<(typeof ZONES)[number], string> = {
  residential: 'bg-emerald-900/60',
  commercial: 'bg-blue-900/60',
  industrial: 'bg-amber-900/60',
  civic: 'bg-violet-900/60',
  port: 'bg-cyan-900/60',
  slum: 'bg-rose-900/40',
};

export function MapEditorPage() {
  const [activeZone, setActiveZone] = useState<(typeof ZONES)[number]>('residential');
  const [cells, setCells] = useState<Record<string, string>>({});
  const [pricePerM2, setPricePerM2] = useState('1000');

  function paint(key: string) {
    setCells((current) => ({ ...current, [key]: activeZone }));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Map Editor & Đơn giá đất"
        description="Quy hoạch vùng, đơn giá $/m² và hệ số mặt tiền. Bản scaffold: thao tác cục bộ, chưa ghi server."
        actions={
          <button className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            Lưu nháp
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {ZONES.map((zone) => (
            <button
              key={zone}
              type="button"
              onClick={() => setActiveZone(zone)}
              className={`rounded-md px-2.5 py-1 text-[11px] capitalize ring-1 ring-inset ${
                activeZone === zone
                  ? 'bg-slate-700 text-white ring-slate-500'
                  : 'text-slate-400 ring-slate-800 hover:bg-slate-800'
              }`}
            >
              {zone}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          Đơn giá $/m²
          <input
            value={pricePerM2}
            onChange={(event) => setPricePerM2(event.target.value)}
            className="w-24 rounded-md border border-slate-700 bg-surface-850 px-2 py-1 font-mono text-xs"
          />
        </label>
      </div>

      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5 overflow-hidden rounded-xl border border-slate-800 bg-surface-900 p-2">
        {Array.from({ length: 24 * 12 }, (_, index) => {
          const key = `${index % 24}-${Math.floor(index / 24)}`;
          const zone = cells[key] as (typeof ZONES)[number] | undefined;
          return (
            <button
              key={key}
              type="button"
              onClick={() => paint(key)}
              title={`${key} · ${zone ?? 'empty'} · $${pricePerM2}/m²`}
              className={`aspect-square rounded-[2px] ring-1 ring-inset ring-slate-800/80 hover:ring-slate-500 ${
                zone ? ZONE_COLOR[zone] : 'bg-slate-900'
              }`}
            />
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500">
        Khi nối API: ghi qua <code className="font-mono">PUT /api/v1/admin/map/nodes</code> theo
        transaction, có optimistic version để tránh ghi đè quy hoạch.
      </p>
    </div>
  );
}
