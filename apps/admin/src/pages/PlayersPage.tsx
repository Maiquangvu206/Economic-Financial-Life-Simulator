import { PageHeader } from '@efls/ui';
import { useState, type FormEvent } from 'react';

export function PlayersPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(query.trim());
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quản lý người chơi"
        description="Tra cứu tài sản, phạt tiền, phong tỏa, cứu trợ và xử lý gian lận."
      />

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tên nhân vật, email hoặc character id"
          className="w-full max-w-md rounded-lg border border-slate-700 bg-surface-850 px-3 py-2 text-sm outline-none focus:border-amber-600"
        />
        <button
          type="submit"
          className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500"
        >
          Tìm
        </button>
      </form>

      <div className="rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center text-xs text-slate-500">
        {submitted ? `Chưa có kết quả cho "${submitted}".` : 'Nhập thông tin nhân vật cần tra cứu.'}
      </div>
    </div>
  );
}
