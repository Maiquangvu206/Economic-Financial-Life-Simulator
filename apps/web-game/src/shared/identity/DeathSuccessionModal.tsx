import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/httpClient';
import { GameButton } from '../ui/GameButton';

type Successor = { id: string; cccd: string; full_name: string; age: number; relation: string; generation_level: number; health_energy: number };

export function DeathSuccessionModal({ open, onCompleted }: { open: boolean; onCompleted: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: successors = [], isLoading } = useQuery<Successor[]>({
    queryKey: ['succession', 'eligible'],
    queryFn: () => apiRequest('/api/v1/succession/eligible-successors'),
    enabled: open,
  });

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const isNewLife = selected == null;
      const trimmedName = newName.trim();
      if (isNewLife && trimmedName.length < 2) {
        throw new Error('Vui lòng nhập họ tên cho nhân vật mới (tối thiểu 2 ký tự).');
      }
      await apiRequest('/api/v1/succession/execute', {
        method: 'POST',
        body: JSON.stringify({
          successorId: selected,
          ...(isNewLife ? { newCharacterFullName: trimmedName } : {}),
        }),
      });
      onCompleted();
    } catch (e: any) {
      setError(e?.message || 'Không thể thực hiện kế thừa.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="p-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Cáo phó & Kế thừa — Cuộc đời mới</h2>
          <p className="text-sm text-slate-600 mt-1">
            Nhân vật của bạn đã qua đời. Mọi giao dịch đã bị khóa. Hãy chọn hậu duệ trực hệ (con/cháu/chắt) còn sống trên cây gia tộc để tiếp tục,
            hoặc bắt đầu cuộc đời mới (18 tuổi). <b>Tên nhân vật không thể thay đổi</b>; nếu chọn hậu duệ, tên giữ nguyên theo tên lúc sinh/nhận nuôi.
            Nếu bắt đầu cuộc đời mới, bạn cần đặt họ tên cho nhân vật mới (tên sẽ được cố định). Nhân vật cũ sẽ bị xóa hoàn toàn; chỉ phần tài sản được
            thừa kế/giải ngân từ quỹ tín thác được chuyển giao, phần tài sản vô chủ sẽ được đấu giá hoặc sung công quỹ.
          </p>
        </div>
        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="text-sm text-slate-500">Đang tải danh sách hậu duệ...</div>
          ) : successors.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-700">Hậu duệ NPC đủ điều kiện kế thừa</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {successors.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s.id)}
                    className={`text-left rounded-xl border p-3 transition ${selected === s.id ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="font-semibold text-slate-800">{s.full_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.relation} · {s.age} tuổi · CCCD: {s.cccd}</div>
                    <div className="text-xs text-slate-500">Sức khỏe: {s.health_energy}</div>
                    <div className="mt-1 text-[11px] text-emerald-700">Tiếp tục với tên: <b>{s.full_name}</b> (cố định)</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Không có hậu duệ trực hệ hợp lệ (còn sống, là NPC). Bạn cần bắt đầu cuộc đời mới hoàn toàn.</div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={`w-full text-left rounded-xl border p-3 transition ${selected === null ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <div className="font-semibold text-slate-800">Bắt đầu cuộc đời mới hoàn toàn</div>
              <div className="text-xs text-slate-500 mt-0.5">Tạo nhân vật 18 tuổi mới với CCCD mới và tài sản khởi điểm cơ bản (không thừa kế trực tiếp hồ sơ nhân vật cũ).</div>
            </button>
            {selected === null && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="new-life-name">
                  Họ và tên nhân vật mới <span className="text-rose-600">*</span>
                </label>
                <input
                  id="new-life-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="Nhập họ tên (cố định sau khi tạo)"
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                />
                <div className="mt-1 text-[11px] text-slate-600">Tên này được đặt khi nhân vật được sinh ra/tạo mới và <b>không thể thay đổi</b> về sau.</div>
              </div>
            )}
          </div>

          {error && <div className="text-sm text-rose-600">{error}</div>}
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <GameButton
            variant="primary"
            onClick={() => void confirm()}
            disabled={busy || (selected === null && newName.trim().length < 2)}
          >
            {busy ? 'Đang thực hiện...' : 'Xác nhận kế thừa & bắt đầu cuộc đời mới'}
          </GameButton>
        </div>
      </div>
    </div>
  );
}
