import { useState } from 'react';
import { apiRequest } from '../api/httpClient';
import { GameInput } from '../ui/GameInput';

type ResolveResult = { cccd_masked: string; full_name: string; is_alive: boolean };

export function CCCDLookupInput({
  value,
  onChange,
  onResolved,
  label = 'CCCD (12 số)',
  placeholder = 'Nhập chính xác 12 số CCCD',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved?: (r: ResolveResult | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setError(null);
    setResult(null);
    onResolved?.(null);
    const cccd = value.replace(/\s+/g, '');
    if (!/^\d{12}$/.test(cccd)) {
      setError('CCCD phải gồm đúng 12 chữ số.');
      return;
    }
    setChecking(true);
    try {
      const r = await apiRequest<ResolveResult>(`/api/v1/characters/resolve-cccd/${cccd}`);
      setResult(r);
      onResolved?.(r);
    } catch (e: any) {
      setError(e?.message || 'Không tìm thấy CCCD.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <GameInput
            label={label}
            value={value}
            onChange={(e) => { onChange(e.target.value); setResult(null); setError(null); onResolved?.(null); }}
            placeholder={placeholder}
            disabled={disabled}
          />
        </div>
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking || disabled}
          className="h-10 mb-0.5 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
        >
          {checking ? 'Đang kiểm tra...' : 'Kiểm tra'}
        </button>
      </div>
      {error && <div className="text-xs text-rose-600">{error}</div>}
      {result && (
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
          <span className="font-semibold">{result.full_name}</span>
          <span className="font-mono">{result.cccd_masked}</span>
          <span className={`px-2 py-0.5 rounded-full ${result.is_alive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
            {result.is_alive ? 'Còn sống' : 'Đã mất'}
          </span>
        </div>
      )}
    </div>
  );
}
