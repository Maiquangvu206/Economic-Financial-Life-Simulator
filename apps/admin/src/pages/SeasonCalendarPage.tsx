import { useState } from 'react';

interface HolidayItem {
  id: string;
  nameVi: string;
  dateStr: string;
  otMultiplier: number;
  isOff: boolean;
  workerImpact: string;
}

export function SeasonCalendarPage() {
  const [selectedSeason, setSelectedSeason] = useState<'spring' | 'summer' | 'autumn' | 'winter'>('spring');
  const [currentWeather, setCurrentWeather] = useState('sunny');
  const [timeSpeedMultiplier, setTimeSpeedMultiplier] = useState(1);
  const [otRatePercent, setOtRatePercent] = useState(300); // 300% theo Bộ luật Lao động VN
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [holidays, setHolidays] = useState<HolidayItem[]>([
    {
      id: 'tet_nguyen_dan',
      nameVi: 'Tết Nguyên Đán (Tết Cổ Truyền)',
      dateStr: '10/02 - 17/02 (7 ngày)',
      otMultiplier: 3.0,
      isOff: true,
      workerImpact: 'Năng suất sản xuất giảm 90%, nhu cầu bán lẻ & chi tiêu tăng 300%',
    },
    {
      id: 'gio_to',
      nameVi: 'Giỗ Tổ Hùng Vương (10/3 Âm lịch)',
      dateStr: '18/04 (1 ngày)',
      otMultiplier: 3.0,
      isOff: true,
      workerImpact: 'Công nhân nghỉ lễ có hưởng lương, làm thêm OT x300%',
    },
    {
      id: 'le_30_4',
      nameVi: 'Giải phóng miền Nam (30/4) & Quốc tế Lao động (1/5)',
      dateStr: '30/04 - 01/05 (2 ngày)',
      otMultiplier: 3.0,
      isOff: true,
      workerImpact: 'Du lịch và dịch vụ ăn uống bùng nổ',
    },
    {
      id: 'quoc_khanh',
      nameVi: 'Quốc khánh Việt Nam (2/9)',
      dateStr: '01/09 - 02/09 (2 ngày)',
      otMultiplier: 3.0,
      isOff: true,
      workerImpact: 'Doanh nghiệp nhà nước & xí nghiệp tư nhân nghỉ lễ',
    },
  ]);

  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName || !newHolidayDate) return;

    setHolidays((prev) => [
      ...prev,
      {
        id: `custom_${Date.now()}`,
        nameVi: newHolidayName,
        dateStr: newHolidayDate,
        otMultiplier: otRatePercent / 100,
        isOff: true,
        workerImpact: 'Ngày nghỉ đặc biệt do Ban quản trị thiết lập',
      },
    ]);
    setNewHolidayName('');
    setNewHolidayDate('');
    setStatusMessage('Đã thêm ngày nghỉ lễ mới thành công!');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleToggleHoliday = (id: string) => {
    setHolidays((prev) =>
      prev.map((h) => (h.id === id ? { ...h, isOff: !h.isOff } : h)),
    );
  };

  const handleApplyChanges = () => {
    setStatusMessage('Đã cập nhật cấu hình Mùa & Chính sách Lịch nghỉ Công nhân tới toàn bộ cụm Server!');
    setTimeout(() => setStatusMessage(null), 3500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            Quản trị Mùa, Thời tiết & Lịch nghỉ Công nhân
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Điều chỉnh chu kỳ 4 mùa, thời tiết tức thì và chính sách nghỉ lễ / làm thêm giờ (OT) chuẩn Luật Lao động Việt Nam.
          </p>
        </div>
        <button
          type="button"
          onClick={handleApplyChanges}
          className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 shadow-md shadow-amber-500/20"
        >
          Áp dụng thay đổi tức thì
        </button>
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/60 p-3 text-xs font-semibold text-emerald-300">
          ✓ {statusMessage}
        </div>
      )}

      {/* Grid 2 cột: Mùa/Thời tiết & Chính sách công nhân */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Panel 1: Điều phối Mùa & Tốc độ thời gian */}
        <div className="rounded-2xl border border-slate-800 bg-surface-900/70 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
            1. Cấu hình Mùa & Chu kỳ Thời tiết
          </h2>

          <div className="space-y-2">
            <label className="text-xs text-slate-300">Chọn mùa khí hậu hiện tại:</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'spring', label: '🌸 Mùa Xuân', desc: 'Mát mẻ, mưa phùn, năng suất +10%' },
                { id: 'summer', label: '☀️ Mùa Hạ', desc: 'Nắng nóng gay gắt, hao thể lực +25%' },
                { id: 'autumn', label: '🍂 Mùa Thu', desc: 'Dễ chịu, sản xuất & kinh doanh đỉnh cao' },
                { id: 'winter', label: '❄️ Mùa Đông', desc: 'Se lạnh rét buốt, chi phí sưởi ấm' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedSeason(m.id as any)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selectedSeason === m.id
                      ? 'border-amber-500 bg-amber-950/40 text-amber-300 ring-1 ring-amber-500'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <p className="font-semibold text-slate-200">{m.label}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-xs text-slate-300">Tình trạng thời tiết tức thì:</label>
            <div className="flex gap-2">
              {[
                { id: 'sunny', label: 'Nắng ráo ☀️' },
                { id: 'rainy', label: 'Mưa rào 🌧️' },
                { id: 'storm', label: 'Áp thấp/Bão ⛈️' },
                { id: 'cloudy', label: 'Nhiều mây ☁️' },
              ].map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setCurrentWeather(w.id)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
                    currentWeather === w.id
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                      : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Tốc độ trôi thời gian tự động:</span>
              <span className="font-mono font-bold text-amber-300">{timeSpeedMultiplier}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={timeSpeedMultiplier}
              onChange={(e) => setTimeSpeedMultiplier(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Panel 2: Chính sách Lao động & Làm thêm giờ (OT) */}
        <div className="rounded-2xl border border-slate-800 bg-surface-900/70 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
            2. Quy định Lao động & Tiền lương Công nhân
          </h2>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Hệ số lương làm thêm ngày lễ (OT):</span>
              <span className="font-mono font-bold text-emerald-400">{otRatePercent}% (x{(otRatePercent / 100).toFixed(1)})</span>
            </div>
            <input
              type="range"
              min="150"
              max="400"
              step="10"
              value={otRatePercent}
              onChange={(e) => setOtRatePercent(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              * Theo Điều 98 Bộ luật Lao động Việt Nam 2019: Làm thêm vào ngày nghỉ lễ, tết tối thiểu bằng 300% chưa kể tiền lương ngày lễ.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs space-y-2">
            <p className="font-semibold text-slate-200">Chỉ số phúc lợi & Công nhân toàn server:</p>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div>Tổng lực lượng lao động: <span className="font-bold text-slate-200">24.500</span></div>
              <div>Tỷ lệ nghỉ lễ có lương: <span className="font-bold text-emerald-400">100%</span></div>
              <div>Bảo hiểm Xã hội (BHXH): <span className="font-bold text-slate-200">Bắt buộc</span></div>
              <div>Quỹ thưởng Tết dự phòng: <span className="font-bold text-amber-400">12,5 tỷ ₫</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Danh sách Lịch nghỉ Lễ & Thêm ngày nghỉ mới */}
      <div className="rounded-2xl border border-slate-800 bg-surface-900/70 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
          3. Lịch nghỉ Lễ & Điều động Công nhân
        </h2>

        <div className="divide-y divide-slate-800/80 overflow-hidden rounded-xl border border-slate-800 bg-surface-950/60">
          {holidays.map((item) => (
            <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-100">{item.nameVi}</span>
                  <span className="text-xs font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/60">
                    {item.dateStr}
                  </span>
                  <span className="text-xs text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded">
                    Lương OT x{item.otMultiplier}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{item.workerImpact}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleHoliday(item.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    item.isOff
                      ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.isOff ? 'Đang áp dụng nghỉ lễ' : 'Đã bỏ nghỉ lễ'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Form thêm ngày nghỉ mới */}
        <form onSubmit={handleAddHoliday} className="pt-2 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Tên ngày nghỉ / Sự kiện công nhân (VD: Ngày truyền thống ngành Than)..."
            value={newHolidayName}
            onChange={(e) => setNewHolidayName(e.target.value)}
            className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Thời gian (VD: 12/11 - 1 ngày)..."
            value={newHolidayDate}
            onChange={(e) => setNewHolidayDate(e.target.value)}
            className="w-full sm:w-56 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            + Thêm ngày nghỉ
          </button>
        </form>
      </div>
    </div>
  );
}

