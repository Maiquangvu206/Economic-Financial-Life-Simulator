import { Link } from 'react-router-dom';
import { PageHeader } from '@efls/ui';
import { formatCompact, formatMoney } from '../../shared/lib/format';
import { TransactionConfirmModal } from '../../shared/ui/TransactionConfirmModal';
import { Panel } from '../../shared/ui/Panel';
import { StatCard } from '../../shared/ui/StatCard';
import { GameButton } from '../../shared/ui/GameButton';
import { GameInput } from '../../shared/ui/GameInput';
import { CCCDLookupInput } from '../../shared/identity/CCCDLookupInput';
import { Modal } from '../../shared/ui/Modal';
import { Badge } from '../../shared/ui/Badge';
import { ENTRY_TYPES, INDUSTRIES, industryLabel, statusBadge } from './businessPage.shared';

export function BusinessPageView(props: any) {
  const {
    confirm,
    createOpen, setCreateOpen,
    selectedId, setSelectedId,
    name, setName,
    industry, setIndustry,
    capital, setCapital,
    premisesKey, setPremisesKey,
    relocatePremisesKey, setRelocatePremisesKey,
    confirmCreate, setConfirmCreate,
    investAmount, setInvestAmount,
    ipoSymbol, setIpoSymbol,
    ipoPrice, setIpoPrice,
    ipoShares, setIpoShares,
    takeoverBuyerCccd, setTakeoverBuyerCccd,
    opexAmount, setOpexAmount,
    opexNote, setOpexNote,
    roleFocus, setRoleFocus,
    headcount, setHeadcount,
    entryType, setEntryType,
    entryAmount, setEntryAmount,
    declaredAmount, setDeclaredAmount,
    entryDesc, setEntryDesc,
    entryEvasion, setEntryEvasion,
    filingPeriod, setFilingPeriod,
    declaredRevenueInput, setDeclaredRevenueInput,
    filingNotes, setFilingNotes,
    usePersonalFundsForShortfall, setUsePersonalFundsForShortfall,
    retainPctInput, setRetainPctInput,
    ownerSalaryInput, setOwnerSalaryInput,
    offerTotalShares, setOfferTotalShares,
    offerPrice, setOfferPrice,
    offerHours, setOfferHours,
    buyOfferShares, setBuyOfferShares,
    groupName, setGroupName,
    groupHoldingCompanyId, setGroupHoldingCompanyId,
    groupAddById, setGroupAddById,
    buyoutCompanyId, setBuyoutCompanyId,
    buyoutPrice, setBuyoutPrice,
    buyoutHours, setBuyoutHours,
    buyoutTenderShares, setBuyoutTenderShares,
    mergerSurvivorId, setMergerSurvivorId,
    mergerTargetId, setMergerTargetId,
    suggestionPlan,
    detailTab, setDetailTab,
    revenuePeriodSearch, setRevenuePeriodSearch,
    editingSalary, setEditingSalary,
    me,
    overview, isLoading, error, refetch,
    premisesOptions, premisesLoading,
    detail, detailLoading,
    selectedCompany, canManage,
    employeesData, employeesLoading,
    hrAcc, hrAccLoading,
    shareOfferings,
    companies, myCompanies, totalValuation, myValuation,
    premisesMap,
    createCompany, relocatePremises, investCompany, ipoCompany, takeoverCompany,
    payOpex, dissolveCompany, fireEmployee,
    createHiringPlan, decideCandidate, applyHiringPlan, dismissHiringPlan, fireStaff,
    updateEmployeeSalary, updateStaffSalary,
    addLedgerEntry, createFiling, setRevenueRetain, setOwnerSalary,
    createShareOffering, buyShareOffering,
    topShareholders, activeEmployees, staff, ledger, filings, revenueSettlements,
    revenuePeriodQuery, filteredRevenueSettlements, payrollForecast,
    groupOverview, groupsLoading, buyoutOverview,
    createGroup, dissolveGroup, addGroupMember, removeGroupMember,
    createBuyout, tenderBuyout, cancelBuyout, squeezeOutBuyout, mergeCompanies,
  } = props;

  if (isLoading) {
    return (
      <Panel title="Doanh nghiệp" borderColor="default">
        <p className="text-sm text-slate-600">Đang tải dữ liệu doanh nghiệp...</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Lỗi tải dữ liệu" borderColor="rose">
        <p className="text-sm text-rose-600">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <GameButton variant="outline" onClick={() => void refetch()}>
          Thử lại
        </GameButton>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Doanh nghiệp"
          description="Thành lập, vận hành, tuyển dụng AI (duyệt), sổ cái/kế toán & khai thuế, đầu tư, IPO, cổ tức, thâu tóm, giải thể. Server authoritative."
        />
        <GameButton variant="primary" onClick={() => setCreateOpen(true)}>
          + Thành lập công ty
        </GameButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng công ty" value={String(companies.length)} hint="Toàn thị trường" />
        <StatCard
          label="Công ty của tôi"
          value={String(myCompanies.length)}
          hint="Bạn sở hữu"
          tone="positive"
        />
        <StatCard
          label="Định giá (của tôi)"
          value={formatCompact(myValuation)}
          hint={formatMoney(myValuation)}
          tone="positive"
        />
        <StatCard
          label="Định giá thị trường"
          value={formatCompact(totalValuation)}
          hint={formatMoney(totalValuation)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Panel title="Công ty của tôi" borderColor="emerald">
          {myCompanies.length === 0 ? (
            <p className="text-sm text-slate-500">
              Bạn chưa sở hữu công ty nào. Hãy thành lập công ty đầu tiên.
            </p>
          ) : (
            <div className="space-y-2">
              {myCompanies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${selectedId === c.id
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 break-words">{c.name}</span>
                    <span className="shrink-0">{statusBadge(c.status)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate">{industryLabel(c.industry)}</span>
                    <span className="shrink-0">{formatCompact(c.valuation.amount)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <div className="min-w-0 xl:col-span-2">
          <Panel title="Thị trường doanh nghiệp" borderColor="default">
            {companies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 space-y-2">
                <p className="text-sm font-medium text-slate-800">Chưa có dữ liệu công ty</p>
                <p className="text-xs text-slate-600">Hiện chưa có công ty nào trên thị trường. Bạn có thể thành lập công ty nếu đã có địa điểm/cơ sở hợp lệ và đủ vốn.</p>
                <GameButton variant="outline" size="sm" onClick={() => setCreateOpen(true)} disabled={!overview}>Thành lập công ty</GameButton>
              </div>
            ) : (
              <div className="overflow-auto max-h-[60vh]">
                <table className="min-w-[680px] w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Công ty</th>
                      <th className="py-2 pr-3">Ngành</th>
                      <th className="py-2 pr-3">Trạng thái</th>
                      <th className="py-2 pr-3 text-right">Định giá</th>
                      <th className="py-2 pr-3 text-right">Quỹ CT</th>
                      <th className="py-2 text-right">Mã CK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companies.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedId(c.id)}
                      >
                        <td className="py-2 pr-3 font-medium text-slate-800">
                          {c.name}
                          {c.isOwner && (
                            <span className="ml-2 text-[10px] font-semibold text-emerald-700">
                              (của tôi)
                            </span>
                          )}
                          <div className="text-[11px] text-slate-500">CT: {c.ownerName}</div>
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{industryLabel(c.industry)}</td>
                        <td className="py-2 pr-3">{statusBadge(c.status)}</td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-700">
                          {formatCompact(c.valuation.amount)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-700">
                          {formatCompact(c.cash.amount)}
                        </td>
                        <td className="py-2 text-right font-mono text-slate-700">
                          {c.tickerSymbol ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Tập đoàn & M&A" borderColor="violet">
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/30 p-3">
              <p className="text-xs font-semibold text-violet-900">Tập đoàn</p>
              <div className="space-y-2">
                <GameInput label="Tên tập đoàn" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="VD: EFLS Group" />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Công ty mẹ</span>
                  <select value={groupHoldingCompanyId} onChange={(e) => setGroupHoldingCompanyId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="">-- Chọn công ty mẹ --</option>
                    {(groupOverview?.eligibleHoldingCompanies ?? []).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <GameButton variant="primary" onClick={() => createGroup.mutate()} disabled={createGroup.isPending || !groupName.trim() || !groupHoldingCompanyId}>
                  {createGroup.isPending ? '...' : 'Tạo tập đoàn'}
                </GameButton>
              </div>
              {groupsLoading ? (
                <p className="text-xs text-slate-500">Đang tải tập đoàn...</p>
              ) : (groupOverview?.groups ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có tập đoàn.</p>
              ) : (
                <div className="space-y-2">
                  {(groupOverview?.groups ?? []).map((g: any) => (
                    <div key={g.id} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{g.name}</div>
                          <div className="text-[11px] text-slate-500">Mẹ: {g.holdingCompanyName} · {g.summary?.memberCount ?? (g.members?.length ?? 0)} công ty</div>
                        </div>
                        {g.isOwner && (
                          <GameButton variant="outline" size="sm" onClick={async () => {
                            const ok = await confirm({ title: `Giải tán "${g.name}"?`, type: 'danger', confirmText: 'Giải tán', message: 'Tập đoàn sẽ bị giải tán.' });
                            if (ok) dissolveGroup.mutate(g.id);
                          }} disabled={dissolveGroup.isPending}>Giải tán</GameButton>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded bg-slate-50 p-2"><div className="text-slate-500">Tổng quỹ</div><div className="font-semibold text-slate-800">{formatMoney(g.summary?.totalCash?.amount ?? 0)}</div></div>
                        <div className="rounded bg-slate-50 p-2"><div className="text-slate-500">Tổng định giá</div><div className="font-semibold text-slate-800">{formatMoney(g.summary?.totalValuation?.amount ?? 0)}</div></div>
                      </div>
                      <div className="space-y-1">
                        {(g.members ?? []).map((m: any) => (
                          <div key={m.companyId} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5 text-[11px]">
                            <div className="min-w-0">
                              <span className="font-medium text-slate-800">{m.companyName}</span>
                              {m.isHolding && <span className="ml-1 text-violet-700">(mẹ)</span>}
                              <span className="ml-2 text-slate-500">{Number(m.controlPct ?? 0).toFixed(2)}%</span>
                              {m.status && <span className="ml-2 text-slate-500">· {m.status}</span>}
                            </div>
                            {g.isOwner && !m.isHolding && (
                              <button type="button" className="text-rose-600 hover:underline" onClick={() => removeGroupMember.mutate({ groupId: g.id, companyId: m.companyId })}>Gỡ</button>
                            )}
                          </div>
                        ))}
                      </div>
                      {g.isOwner && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <label className="block flex-1">
                            <span className="mb-1 block text-[11px] font-medium text-slate-600">Thêm công ty (&gt;50%)</span>
                            <select value={groupAddById[g.id] ?? ''} onChange={(e) => setGroupAddById((p: any) => ({ ...p, [g.id]: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800">
                              <option value="">-- Chọn công ty --</option>
                              {(groupOverview?.eligibleMemberCompanies ?? []).filter((c: any) => c.id !== g.holdingCompanyId).map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name} ({Number(c.controlPct).toFixed(1)}%)</option>
                              ))}
                            </select>
                          </label>
                          <GameButton variant="outline" size="sm" onClick={() => {
                            const cid = groupAddById[g.id];
                            if (cid) addGroupMember.mutate({ groupId: g.id, companyId: cid });
                          }} disabled={addGroupMember.isPending || !(groupAddById[g.id])}>Thêm</GameButton>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/30 p-3">
              <p className="text-xs font-semibold text-sky-900">Mua lại 100%</p>
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Công ty mục tiêu</span>
                  <select value={buyoutCompanyId} onChange={(e) => setBuyoutCompanyId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="">-- Chọn công ty --</option>
                    {companies.filter((c: any) => c.status === 'active' || c.status === 'ipo').map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <GameInput label="Giá/CP (VND)" type="number" min={1} value={buyoutPrice} onChange={(e) => setBuyoutPrice(e.target.value)} />
                  <GameInput label="Thời hạn (giờ)" type="number" min={1} value={buyoutHours} onChange={(e) => setBuyoutHours(e.target.value)} />
                </div>
                <GameButton variant="primary" onClick={() => createBuyout.mutate()} disabled={createBuyout.isPending || !buyoutCompanyId}>
                  {createBuyout.isPending ? '...' : 'Tạo đề nghị mua lại'}
                </GameButton>
              </div>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {(buyoutOverview?.offers ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa có đề nghị mua lại.</p>
                ) : (buyoutOverview?.offers ?? []).map((o: any) => {
                  const open = o.status === 'open';
                  const mineCanSell = !o.isAcquirer && (o.myShares ?? 0) > 0;
                  const qtyStr = buyoutTenderShares[o.id] ?? String(o.myShares ?? 1);
                  return (
                    <div key={o.id} className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{o.companyName}</span>
                        <Badge variant={open ? 'success' : 'default'}>{o.status}</Badge>
                      </div>
                      <div className="text-slate-600">Giá {formatMoney(o.pricePerShare?.amount ?? 0)}/CP · Người mua: {o.acquirerName || '—'}</div>
                      <div className="text-slate-500">Kiểm soát người mua: {Number(o.acquirerControlPct ?? 0).toFixed(2)}% · Bạn có: {Number(o.myShares ?? 0).toLocaleString('vi-VN')} CP</div>
                      {mineCanSell && open && (
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="w-28"><GameInput label="Số CP bán" type="number" min={1} value={qtyStr} onChange={(e) => setBuyoutTenderShares((p: any) => ({ ...p, [o.id]: e.target.value }))} /></div>
                          <GameButton variant="outline" size="sm" onClick={() => tenderBuyout.mutate({ offerId: o.id, shares: Math.max(1, Math.floor(Number(qtyStr) || 0)) })} disabled={tenderBuyout.isPending}>Bán</GameButton>
                          <GameButton variant="outline" size="sm" onClick={() => tenderBuyout.mutate({ offerId: o.id })} disabled={tenderBuyout.isPending}>Bán hết</GameButton>
                        </div>
                      )}
                      {o.isAcquirer && (
                        <div className="flex flex-wrap gap-2">
                          {open && <GameButton variant="outline" size="sm" onClick={() => cancelBuyout.mutate(o.id)} disabled={cancelBuyout.isPending}>Hủy đề nghị</GameButton>}
                          {o.allowSqueezeOut && Number(o.acquirerControlPct ?? 0) >= 95 && Number(o.acquirerControlPct ?? 0) < 100 && (
                            <GameButton variant="primary" size="sm" onClick={() => squeezeOutBuyout.mutate(o.id)} disabled={squeezeOutBuyout.isPending}>Ép mua cổ đông thiểu số</GameButton>
                          )}
                          {o.canMerge && <span className="text-emerald-700 font-medium">Đủ 100% để sáp nhập</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/30 p-3">
              <p className="text-xs font-semibold text-amber-900">Sáp nhập (A → B)</p>
              <p className="text-[11px] text-slate-600">Công ty tiếp nhận và công ty bị sáp nhập phải do bạn kiểm soát; công ty bị sáp nhập cần sở hữu 100%.</p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Công ty tiếp nhận (B)</span>
                <select value={mergerSurvivorId} onChange={(e) => setMergerSurvivorId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                  <option value="">-- Chọn công ty tiếp nhận --</option>
                  {myCompanies.filter((c: any) => c.status === 'active' || c.status === 'ipo').map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Công ty bị sáp nhập (A)</span>
                <select value={mergerTargetId} onChange={(e) => setMergerTargetId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                  <option value="">-- Chọn công ty bị sáp nhập --</option>
                  {myCompanies.filter((c: any) => c.id !== mergerSurvivorId && (c.status === 'active' || c.status === 'ipo')).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <GameButton variant="primary" onClick={async () => {
                if (!mergerSurvivorId || !mergerTargetId) return;
                const s = companies.find((c: any) => c.id === mergerSurvivorId)?.name ?? 'B';
                const t = companies.find((c: any) => c.id === mergerTargetId)?.name ?? 'A';
                const ok = await confirm({ title: `Sáp nhập "${t}" vào "${s}"?`, type: 'danger', confirmText: 'Sáp nhập', message: 'Công ty bị sáp nhập sẽ chuyển sang trạng thái đã sáp nhập. Hành động không thể hoàn tác.' });
                if (ok) mergeCompanies.mutate();
              }} disabled={mergeCompanies.isPending || !mergerSurvivorId || !mergerTargetId}>
                {mergeCompanies.isPending ? '...' : 'Thực hiện sáp nhập'}
              </GameButton>
              <div className="rounded-lg border border-amber-100 bg-white p-2 text-[11px] text-slate-600">
                Lưu ý: lịch sử kỳ doanh thu/kê khai thuế của công ty bị sáp nhập được giữ lại theo dữ liệu hiện có; nhân sự và quỹ công ty được chuyển sang công ty tiếp nhận (theo điều kiện hệ thống).
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Thành lập công ty" size="2xl">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const selected = premisesMap.get(premisesKey);
            const allPremises = [...(premisesOptions?.land ?? []), ...(premisesOptions?.companyProperties ?? [])];
            const found = allPremises.find((o) => `${o.type}:${o.id}` === premisesKey);
            if (!name.trim() || !selected || !found) {
              toast({ title: 'Thiếu thông tin', description: 'Vui lòng nhập tên công ty và chọn địa điểm/cơ sở hợp lệ.', variant: 'error' });
              return;
            }
            const cap = Math.max(0, Math.floor(Number(capital) || 0));
            if (cap <= 0) {
              toast({ title: 'Vốn không hợp lệ', description: 'Vốn khởi điểm phải lớn hơn 0.', variant: 'error' });
              return;
            }
            setConfirmCreate({
              idempotencyKey: createIdempotencyKey(),
              name: name.trim(),
              industry,
              capital: cap,
              premisesLabel: found.label ?? premisesKey,
            });
          }}
        >
          <GameInput
            id="company-create-name"
            label="Tên công ty"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: EFLS Tech"
            required
          />
          <div className="space-y-1">
            <label htmlFor="company-create-industry" className="text-[11px] uppercase tracking-wider text-slate-500">Ngành</label>
            <select
              id="company-create-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value as IndustryType)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              {INDUSTRIES.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <GameInput
            id="company-create-capital"
            label="Vốn khởi điểm (đ)"
            type="number"
            min={1}
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
            required
          />

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <label htmlFor="company-create-premises" className="text-[11px] uppercase tracking-wider text-slate-600">Địa điểm / cơ sở công ty (bắt buộc)</label>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ['corporations', 'premises-options'] })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">Làm mới</button>
              </div>
            </div>

            {premisesLoading ? (
              <p className="text-xs text-slate-500">Đang tải địa điểm khả dụng từ bất động sản/bản đồ...</p>
            ) : (
              <div className="space-y-2">
                <label htmlFor="company-create-premises" className="text-xs font-semibold text-slate-700">Chọn địa điểm/cơ sở (combo box)</label>
                <select
                  id="company-create-premises"
                  value={premisesKey}
                  onChange={(e) => setPremisesKey(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">-- Chọn địa điểm thành lập công ty --</option>
                  <optgroup label="Đất nền / trụ sở đã hợp thửa & xây dựng công ty (sở hữu của bạn)">
                    {(premisesOptions?.land ?? []).length === 0 ? (
                      <option value="" disabled>Không có đất nền hoặc trụ sở công ty (≥ 2 ô liền nhau, đã xây dựng &quot;Công ty&quot;) phù hợp</option>
                    ) : (
                      (premisesOptions?.land ?? []).map((o) => {
                        const key = `${o.type}:${o.id}`;
                        const suffix = o.type === 'land_province'
                          ? ` · ${o.provinceName ?? o.provinceCode ?? 'Tỉnh/thành'}`
                          : ' · Hà Nội';
                        return <option key={key} value={key}>{o.label}{suffix}</option>;
                      })
                    )}
                  </optgroup>
                  <optgroup label="Bất động sản thuộc công ty khác (đặt trụ sở)">
                    {(premisesOptions?.companyProperties ?? []).length === 0 ? (
                      <option value="" disabled>Không có bất động sản công ty khác khả dụng</option>
                    ) : (
                      (premisesOptions?.companyProperties ?? []).map((o) => {
                        const key = `${o.type}:${o.id}`;
                        return <option key={key} value={key}>{o.label}{o.hostCompanyName ? ` · ${o.hostCompanyName}` : ''}</option>;
                      })
                    )}
                  </optgroup>
                </select>

                {premisesKey && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800">
                    Đã chọn: <b>{(() => {
                      const all = [...(premisesOptions?.land ?? []), ...(premisesOptions?.companyProperties ?? [])];
                      const found = all.find((o) => `${o.type}:${o.id}` === premisesKey);
                      return found?.label ?? premisesKey;
                    })()}</b>
                  </div>
                )}
              </div>
            )}

            {!premisesLoading && (premisesOptions?.land?.length ?? 0) === 0 && (premisesOptions?.companyProperties?.length ?? 0) === 0 && (
              <p className="text-[11px] text-amber-700">
                Chưa có địa điểm khả dụng. Hãy sở hữu đất nền/trụ sở công ty (đã hợp thửa và xây dựng) hoặc sử dụng bất động sản đã xây dựng thuộc công ty khác.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <GameButton
              variant="primary"
              type="submit"
              disabled={createCompany.isPending || !name.trim() || !premisesKey || premisesLoading}
            >
              {createCompany.isPending ? 'Đang tạo...' : 'Tiếp tục xác nhận'}
            </GameButton>
          </div>
        </form>
      </Modal>

      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title={selectedCompany ? `Công ty: ${selectedCompany.name}` : 'Chi tiết công ty'} size="2xl">
        {!selectedCompany ? (
          <p className="text-sm text-slate-500">
            {detailLoading ? 'Đang tải...' : 'Không tìm thấy công ty.'}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
              {[
                { key: 'overview', label: 'Tổng quan' },
                { key: 'finance', label: 'Tài chính & Thuế' },
                { key: 'hr', label: 'Nhân sự & Lương' },
                { key: 'equity', label: 'Cổ phần & Gọi vốn' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setDetailTab(tab.key as typeof detailTab)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${detailTab === tab.key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {detailTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Ngành</span><div className="font-medium text-right sm:text-left">{industryLabel(selectedCompany.industry)}</div></div>
                  <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Chủ sở hữu</span><div className="font-medium text-right sm:text-left break-words">{selectedCompany.ownerName}</div></div>
                  <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Trạng thái</span><div>{statusBadge(selectedCompany.status)}</div></div>
                  <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Mã CK</span><div className="font-mono">{selectedCompany.tickerSymbol ?? '—'}</div></div>
                  <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Định giá</span><div className="font-mono text-right sm:text-left">{formatMoney(selectedCompany.valuation.amount)}</div></div>
                  <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Quỹ công ty</span><div className="font-mono text-right sm:text-left">{formatMoney(selectedCompany.cash.amount)}</div></div>
                  <div className="flex justify-between gap-2 sm:col-span-2 sm:block"><span className="text-slate-500">Địa điểm/cơ sở</span><div className="font-medium text-right sm:text-left break-words">
                    <div>{selectedCompany.premises?.label ?? '— (công ty cũ, chưa gắn địa điểm)'}</div>
                    {selectedCompany.premises && (
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {selectedCompany.premises.type === 'company_property' ? (
                          <>Liên kết Bất động sản (thuộc công ty: {selectedCompany.premises.hostCompanyName ?? '—'}) · <Link to="/real-estate" className="underline text-emerald-700">Mở Bất động sản</Link></>
                        ) : (
                          <>Liên kết Thành phố/Bản đồ{selectedCompany.premises.provinceCode ? ` · Tỉnh/thành: ${selectedCompany.premises.provinceCode}` : ''} · <Link to="/" className="underline text-emerald-700">Mở Thành phố/Bản đồ</Link></>
                        )}
                      </div>
                    )}
                    {selectedCompany.isOwner && selectedCompany.premises?.needsReselection && selectedCompany.status !== 'bankrupt' && (
                      <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-left text-[11px] text-amber-900 space-y-2">
                        <div className="font-semibold">⚠️ Cần chọn trụ sở mới cho công ty</div>
                        <div>{selectedCompany.premises.invalidReason || 'Công trình/địa điểm trụ sở đã bị phá dỡ hoặc không còn hợp lệ.'}</div>
                        <div className="text-[10px] text-amber-800">Chọn từ dữ liệu bất động sản đang sở hữu (lọc <b>lô gốc</b>, không gồm lô thành viên đã hợp thửa), tương tự lựa chọn tài sản khi vay.</div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          <select
                            className="flex-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                            value={relocatePremisesKey}
                            onChange={(e) => setRelocatePremisesKey(e.target.value)}
                          >
                            <option value="">-- Chọn trụ sở mới --</option>
                            <optgroup label="Đất nền / trụ sở công ty (sở hữu, lô gốc)">
                              {(premisesOptions?.land ?? []).map((o) => (
                                <option key={`reloc-${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{o.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Bất động sản thuộc công ty khác">
                              {(premisesOptions?.companyProperties ?? []).map((o) => (
                                <option key={`reloc-${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{o.label}</option>
                              ))}
                            </optgroup>
                          </select>
                          <button
                            type="button"
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                            disabled={relocatePremises.isPending || !relocatePremisesKey}
                            onClick={() => relocatePremises.mutate(selectedCompany.id)}
                          >
                            {relocatePremises.isPending ? 'Đang cập nhật...' : 'Xác nhận trụ sở mới'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div></div>
                </div>

                {selectedCompany.status !== 'ipo' && (
                  <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-700">Nạp vốn / Bơm quỹ công ty</p>
                    <p className="text-[11px] text-slate-500">Chuyển tiền từ ví cá nhân vào quỹ công ty (dùng cho OPEX, thuế, lương). Công ty đã IPO không sử dụng nạp vốn trực tiếp.</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <GameInput label="Số tiền nạp (VND)" type="number" min={1} value={investAmount} onChange={(e) => setInvestAmount(e.target.value)} />
                      </div>
                      <GameButton variant="primary" onClick={() => investCompany.mutate(selectedCompany.id)} disabled={investCompany.isPending || selectedCompany.status === 'bankrupt'}>
                        {investCompany.isPending ? '...' : 'Nạp vốn'}
                      </GameButton>
                    </div>
                  </div>
                )}

                {canManage && selectedCompany.status !== 'bankrupt' && (
                  <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                    <p className="text-xs font-semibold text-rose-800">Giải thể công ty</p>
                    <p className="text-[11px] text-slate-600">Chuyển công ty sang trạng thái phá sản/giải thể (không thể hoàn tác).</p>
                    <GameButton
                      variant="outline"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Giải thể "${selectedCompany.name}"?`,
                          type: 'danger',
                          confirmText: 'Giải thể',
                          message: 'Công ty sẽ chuyển sang trạng thái phá sản/giải thể. Hành động này không thể hoàn tác.',
                        });
                        if (ok) dissolveCompany.mutate(selectedCompany.id);
                      }}
                      disabled={dissolveCompany.isPending}
                    >
                      {dissolveCompany.isPending ? '...' : 'Giải thể công ty'}
                    </GameButton>
                  </div>
                )}
              </div>
            )}

            {detailTab === 'finance' && (
              <div className="space-y-4">
                {canManage && selectedCompany.status !== 'bankrupt' ? (
                  <>
                    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
                      <p className="text-xs font-semibold text-emerald-800">Vận hành</p>
                      <div className="rounded-lg border border-emerald-100 bg-white p-2 space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-700">Tỉ lệ giữ lại doanh thu tự động vào quỹ công ty</p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="flex-1 sm:max-w-xs">
                            <GameInput label="% giữ lại trong quỹ công ty (0-100)" type="number" min={0} max={100} value={retainPctInput} onChange={(e) => setRetainPctInput(e.target.value)} />
                          </div>
                          <GameButton variant="outline" onClick={() => setRevenueRetain.mutate(selectedCompany.id)} disabled={setRevenueRetain.isPending}>
                            {setRevenueRetain.isPending ? '...' : 'Lưu tỉ lệ (kỳ sau)'}
                          </GameButton>
                        </div>
                        <p className="text-[11px] text-slate-500">Hiện tại: {(selectedCompany as any).revenueRetainPct ?? 0}% giữ lại quỹ công ty, {100 - Number((selectedCompany as any).revenueRetainPct ?? 0)}% trả về ví chủ sở hữu.</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1 sm:col-span-2 sm:max-w-md">
                          <GameInput label="OPEX (VND) - trừ từ quỹ công ty" type="number" min={1} value={opexAmount} onChange={(e) => setOpexAmount(e.target.value)} />
                          <GameInput label="Ghi chú" value={opexNote} onChange={(e) => setOpexNote(e.target.value)} />
                          <GameButton variant="outline" onClick={() => payOpex.mutate(selectedCompany.id)} disabled={payOpex.isPending}>
                            {payOpex.isPending ? '...' : 'Chi OPEX'}
                          </GameButton>
                        </div>
                      </div>
                    </div>

                    {detail?.isOwner && (
                      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/30 p-3">
                        <div>
                          <p className="text-xs font-semibold text-amber-900">Kế toán & khai thuế doanh nghiệp</p>
                        </div>
                        {hrAccLoading ? (
                          <p className="text-xs text-slate-500">Đang tải dữ liệu kế toán...</p>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <div className="rounded-lg bg-white p-2"><div className="text-[10px] text-slate-500">Doanh thu thực tế</div><div className="text-xs font-semibold text-slate-800">{formatMoney(ledger?.totals.revenue.amount ?? 0)}</div></div>
                              <div className="rounded-lg bg-white p-2"><div className="text-[10px] text-slate-500">Doanh thu đã khai</div><div className="text-xs font-semibold text-slate-800">{formatMoney(ledger?.totals.declaredRevenue.amount ?? 0)}</div></div>
                              <div className="rounded-lg bg-white p-2"><div className="text-[10px] text-slate-500">Chi phí</div><div className="text-xs font-semibold text-slate-800">{formatMoney(ledger?.totals.expense.amount ?? 0)}</div></div>
                              <div className="rounded-lg bg-white p-2"><div className="text-[10px] text-slate-500">Chênh lệch khai báo</div><div className="text-xs font-semibold text-amber-800">{formatMoney(ledger?.totals.taxGap.amount ?? 0)}</div></div>
                            </div>

                            <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-2.5">
                              <p className="text-[11px] font-semibold text-slate-700">Ghi bút toán</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="block">
                                  <span className="mb-1 block text-xs font-medium text-slate-600">Loại bút toán</span>
                                  <select value={entryType} onChange={(e) => setEntryType(e.target.value as typeof entryType)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                                    {ENTRY_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                                  </select>
                                </label>
                                <GameInput label="Số tiền (VND)" type="number" min={1} value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} />
                                <GameInput label="Số tiền khai báo (để trống = số tiền thực)" type="number" min={0} value={declaredAmount} onChange={(e) => setDeclaredAmount(e.target.value)} />
                                <GameInput label="Diễn giải" value={entryDesc} onChange={(e) => setEntryDesc(e.target.value)} placeholder="VD: tiền thuê văn phòng" />
                              </div>
                              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                                <input type="checkbox" checked={entryEvasion} onChange={(e) => setEntryEvasion(e.target.checked)} />
                                Đánh dấu bút toán có dấu hiệu khai sai/trốn thuế
                              </label>
                              <GameButton variant="outline" onClick={() => addLedgerEntry.mutate(selectedCompany.id)} disabled={addLedgerEntry.isPending || !(Number(entryAmount) > 0)}>
                                {addLedgerEntry.isPending ? 'Đang ghi...' : 'Ghi bút toán'}
                              </GameButton>
                            </div>

                            <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-2.5">
                              <p className="text-[11px] font-semibold text-slate-700">Khai và nộp thuế</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <GameInput label="Kỳ (để trống = kỳ gần nhất chưa khai)" value={filingPeriod} onChange={(e) => setFilingPeriod(e.target.value)} placeholder="VD: 2000-01" />
                                <GameInput label="Doanh thu khai báo (VND)" type="number" min={0} value={declaredRevenueInput} onChange={(e) => setDeclaredRevenueInput(e.target.value)} />
                              </div>
                              <GameInput label="Ghi chú (không bắt buộc)" value={filingNotes} onChange={(e) => setFilingNotes(e.target.value)} />
                              <label className="flex items-start gap-2 text-[11px] text-slate-600">
                                <input type="checkbox" className="mt-0.5" checked={usePersonalFundsForShortfall} onChange={(e) => setUsePersonalFundsForShortfall(e.target.checked)} />
                                <span>Cho phép dùng ví cá nhân bù phần quỹ công ty thiếu để nộp thuế và xử lý cổ tức.</span>
                              </label>
                              <GameButton variant="primary" onClick={() => createFiling.mutate(selectedCompany.id)} disabled={createFiling.isPending}>
                                {createFiling.isPending ? 'Đang nộp...' : 'Khai & nộp thuế'}
                              </GameButton>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-end justify-between gap-2">
                                <div>
                                  <p className="text-[11px] font-semibold text-slate-700">Bảng thống kê doanh thu theo kỳ (dùng để khai thuế)</p>
                                  <p className="text-[11px] text-slate-500">Doanh thu thực tế do hệ thống tự chốt mỗi 30 ngày game. Khi khai thuế, bạn nên đối chiếu cột <b>Doanh thu thực tế</b> của kỳ tương ứng.</p>
                                </div>
                                {revenueSettlements.length > 0 && (
                                  <div className="w-full sm:w-64">
                                    <label className="block">
                                      <span className="mb-1 block text-[11px] font-medium text-slate-600">Tra cứu kỳ</span>
                                      <input
                                        type="text"
                                        value={revenuePeriodSearch}
                                        onChange={(e) => setRevenuePeriodSearch(e.target.value)}
                                        placeholder="VD: 2001-03, 2001, chưa khai..."
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>
                              {revenueSettlements.length === 0 ? (
                                <p className="rounded-lg bg-white p-2 text-[11px] text-slate-500">Chưa có kỳ chốt doanh thu nào. Hệ thống sẽ tự tạo dữ liệu sau mỗi chu kỳ 30 ngày game khi công ty đủ điều kiện.</p>
                              ) : filteredRevenueSettlements.length === 0 ? (
                                <p className="rounded-lg bg-white p-2 text-[11px] text-slate-500">Không tìm thấy kỳ phù hợp với từ khóa tra cứu.</p>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white [-webkit-overflow-scrolling:touch]">
                                  <div className="max-h-80 overflow-y-auto overscroll-contain">
                                    <table className="w-full min-w-[720px] border-collapse text-[11px]">
                                      <thead className="sticky top-0 z-10 bg-slate-50">
                                        <tr className="border-b border-slate-200 text-slate-600">
                                          <th className="px-2.5 py-2 text-left font-semibold">Kỳ</th>
                                          <th className="px-2.5 py-2 text-left font-semibold">Năm/Tháng game</th>
                                          <th className="px-2.5 py-2 text-right font-semibold">Doanh thu thực tế</th>
                                          <th className="px-2.5 py-2 text-right font-semibold">Đã khai</th>
                                          <th className="px-2.5 py-2 text-right font-semibold">Thuế đã nộp</th>
                                          <th className="px-2.5 py-2 text-left font-semibold">Trạng thái khai</th>
                                          <th className="px-2.5 py-2 text-left font-semibold">Chốt lúc</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {filteredRevenueSettlements.map((s) => (
                                          <tr key={s.id} className="hover:bg-slate-50/60">
                                            <td className="px-2.5 py-2 font-medium text-slate-800">{s.periodKey}</td>
                                            <td className="px-2.5 py-2 text-slate-600">{s.gameYear}-{String(s.gameMonth).padStart(2, '0')}</td>
                                            <td className="px-2.5 py-2 text-right font-semibold text-emerald-700">{formatMoney(s.actualRevenue.amount)}</td>
                                            <td className="px-2.5 py-2 text-right text-slate-700">{s.declaredRevenue ? formatMoney(s.declaredRevenue.amount) : '—'}</td>
                                            <td className="px-2.5 py-2 text-right text-slate-700">{s.taxPaid ? formatMoney(s.taxPaid.amount) : '—'}</td>
                                            <td className="px-2.5 py-2">
                                              {s.filed ? (
                                                <Badge variant={s.filingStatus === 'penalized' ? 'warning' : s.filingStatus === 'audited' ? 'success' : 'default'}>
                                                  {s.filingStatus ?? 'đã khai'}
                                                </Badge>
                                              ) : (
                                                <Badge variant="warning">Chưa khai</Badge>
                                              )}
                                            </td>
                                            <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{new Date(s.settledAt).toLocaleString('vi-VN')}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              {revenueSettlements.length > 0 && (
                                <p className="text-[11px] text-slate-500">
                                  Hiển thị {filteredRevenueSettlements.length}/{revenueSettlements.length} kỳ
                                  {revenuePeriodQuery ? ' (đang lọc theo tra cứu)' : ''}.
                                </p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold text-slate-700">Lịch sử khai thuế</p>
                              {filings.length === 0 ? (
                                <p className="rounded-lg bg-white p-2 text-[11px] text-slate-500">Chưa có hồ sơ khai thuế. Hồ sơ chỉ lập được sau khi hệ thống chốt doanh thu ít nhất một kỳ 30 ngày game.</p>
                              ) : filings.map((filing) => (
                                <div key={filing.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[11px]">
                                  <div><span className="font-medium text-slate-800">Kỳ {filing.periodKey ?? filing.period}</span><span className="ml-2 text-slate-500">{new Date(filing.createdAt).toLocaleDateString('vi-VN')}</span></div>
                                  <div className="text-right text-slate-600">Thuế {formatMoney(filing.taxPaid.amount)} · DT khai {formatMoney(filing.declaredRevenue.amount)} <Badge variant={filing.status === 'penalized' ? 'warning' : filing.status === 'audited' ? 'success' : 'default'}>{filing.status}</Badge></div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Chỉ chủ sở hữu công ty hoạt động mới quản lý vận hành, kế toán và thuế.</div>
                )}
              </div>
            )}

            {detailTab === 'hr' && (
              <div className="space-y-4">
                {!canManage || !detail?.isOwner ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Chỉ chủ sở hữu công ty mới quản lý nhân sự và lương.</div>
                ) : (
                  <>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
                      <div className="space-y-3 rounded-xl border border-slate-200 p-3 min-w-0">
                        <div>
                          <p className="text-xs font-semibold text-slate-700">Nhân sự</p>
                        </div>

                        {hrAcc?.ownerRole && (
                          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-xs font-semibold text-emerald-900">
                                  {hrAcc.ownerRole.characterName} <span className="ml-1 rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">Chủ sở hữu</span>
                                </div>
                                <div className="text-[11px] text-slate-700">{hrAcc.ownerRole.roleTitle} · Lương cấu hình: <b>{formatMoney(hrAcc.ownerRole.salary.amount)}</b>/tháng (game)</div>
                              </div>
                              <Badge variant={hrAcc.ownerRole.status === 'active' ? 'success' : 'default'}>{hrAcc.ownerRole.status === 'active' ? 'Đang trả lương' : 'Chưa kích hoạt'}</Badge>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <div className="flex-1">
                                <GameInput label="Lương chủ doanh nghiệp" type="number" min={0} step={1000} value={ownerSalaryInput} onChange={(e) => setOwnerSalaryInput(e.target.value)} />
                              </div>
                              <GameButton variant="primary" size="sm" onClick={() => setOwnerSalary.mutate(selectedCompany.id)} disabled={setOwnerSalary.isPending || !canManage}>
                                {setOwnerSalary.isPending ? 'Đang lưu...' : 'Lưu lương chủ DN'}
                              </GameButton>
                            </div>
                          </div>
                        )}

                        {payrollForecast && (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                            <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Lương NV/tháng</div><div className="text-xs font-semibold text-slate-800">{formatMoney(payrollForecast.employeeMonthly.amount)}</div></div>
                            <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Lương AI/tháng</div><div className="text-xs font-semibold text-slate-800">{formatMoney(payrollForecast.staffMonthly.amount)}</div></div>
                            <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Lương chủ DN/tháng</div><div className="text-xs font-semibold text-slate-800">{formatMoney(payrollForecast.ownerMonthly.amount)}</div></div>
                            <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Tổng/tháng (game)</div><div className="text-xs font-semibold text-slate-800">{formatMoney(payrollForecast.totalMonthly.amount)}</div></div>
                            <div className="rounded-lg bg-amber-50 p-2 border border-amber-100 sm:col-span-2 xl:col-span-1"><div className="text-[10px] text-amber-700">Tổng nợ lương</div><div className="text-xs font-semibold text-amber-900">{formatMoney(payrollForecast.totalArrears.amount)}</div><div className="text-[10px] text-amber-700">NV {formatMoney(payrollForecast.employeeArrears.amount)} · AI {formatMoney(payrollForecast.staffArrears.amount)}</div></div>
                          </div>
                        )}

                        {(employeesLoading || hrAccLoading) ? (
                          <p className="text-xs text-slate-500">Đang tải nhân sự...</p>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-[11px] font-semibold text-slate-700">Nhân viên (hợp đồng người chơi)</div>
                            {activeEmployees.filter((e: any) => !e.isOwnerRole).length === 0 ? (
                              <p className="text-xs text-slate-500">Chưa có nhân viên (người chơi) đang làm việc.</p>
                            ) : activeEmployees.filter((e: any) => !e.isOwnerRole).map((e: any) => {
                              const isEditing = editingSalary?.targetType === 'employee' && editingSalary.targetId === e.employmentId;
                              const arrears = Number(e.salaryArrears?.amount ?? e.salary_arrears_minor ?? 0);
                              return (
                                <div key={`emp-${e.employmentId}`} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs space-y-2">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <div className="font-medium text-slate-800">{e.characterName} <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">Hợp đồng</span></div>
                                      <div className="text-slate-500">{e.jobTitle} · {formatMoney(e.salary.amount)}/tháng (game)</div>
                                      {arrears > 0 && <div className="text-amber-700">Nợ lương: {formatMoney(arrears)}</div>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <GameButton
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingSalary(isEditing ? null : { targetType: 'employee', targetId: e.employmentId, value: String(e.salary.amount ?? 0), reason: '' })}
                                        disabled={updateEmployeeSalary.isPending}
                                      >
                                        {isEditing ? 'Đóng' : 'Đổi lương'}
                                      </GameButton>
                                      <GameButton variant="outline" size="sm" onClick={() => fireEmployee.mutate({ companyId: selectedCompany.id, employmentId: e.employmentId })} disabled={fireEmployee.isPending}>Sa thải</GameButton>
                                    </div>
                                  </div>
                                  {isEditing && editingSalary && (
                                    <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                                      <GameInput label="Lương mới (₫/tháng game)" type="number" min={0} step={1000} value={editingSalary.value} onChange={(ev) => setEditingSalary({ ...editingSalary, value: ev.target.value })} />
                                      <GameInput label="Lý do (tuỳ chọn)" value={editingSalary.reason} onChange={(ev) => setEditingSalary({ ...editingSalary, reason: ev.target.value })} placeholder="VD: tăng theo hiệu suất" />
                                      <GameButton
                                        variant="primary"
                                        size="sm"
                                        onClick={() => updateEmployeeSalary.mutate({ companyId: selectedCompany.id, employmentId: e.employmentId, amount: Number(editingSalary.value) || 0, reason: editingSalary.reason })}
                                        disabled={updateEmployeeSalary.isPending}
                                      >
                                        {updateEmployeeSalary.isPending ? 'Đang lưu...' : 'Lưu lương'}
                                      </GameButton>
                                      <p className="text-[11px] text-slate-500 sm:col-span-3">Giới hạn: mỗi lần tăng tối đa +200% so với lương hiện tại (nếu lương hiện tại &gt; 0). Lương trả từ quỹ công ty theo kỳ.</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            <div className="pt-1 text-[11px] font-semibold text-slate-700">Nhân sự AI (company staff)</div>
                            {staff.filter((s: any) => !s.isOwnerRole).length === 0 ? (
                              <p className="text-xs text-slate-500">Chưa có nhân sự AI đang làm việc.</p>
                            ) : staff.filter((s: any) => !s.isOwnerRole).map((s: any) => {
                              const isEditing = editingSalary?.targetType === 'staff' && editingSalary.targetId === s.id;
                              const arrears = Number(s.salaryArrears?.amount ?? s.salary_arrears_minor ?? 0);
                              return (
                                <div key={`ai-${s.id}`} className="rounded-lg bg-sky-50 px-2.5 py-2 text-xs border border-sky-100 space-y-2">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <div className="font-medium text-slate-800">{s.fullName} <span className="ml-1 rounded bg-sky-200 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">AI tuyển</span></div>
                                      <div className="text-slate-500">{s.roleTitle} · {formatMoney(s.salary.amount)}/tháng (game)</div>
                                      {arrears > 0 && <div className="text-amber-700">Nợ lương: {formatMoney(arrears)}</div>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <GameButton
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingSalary(isEditing ? null : { targetType: 'staff', targetId: s.id, value: String(s.salary.amount ?? 0), reason: '' })}
                                        disabled={updateStaffSalary.isPending}
                                      >
                                        {isEditing ? 'Đóng' : 'Đổi lương'}
                                      </GameButton>
                                      <GameButton variant="outline" size="sm" onClick={() => fireStaff.mutate({ companyId: selectedCompany.id, staffId: s.id })} disabled={fireStaff.isPending}>Sa thải</GameButton>
                                    </div>
                                  </div>
                                  {isEditing && editingSalary && (
                                    <div className="grid gap-2 rounded-md border border-sky-200 bg-white p-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                                      <GameInput label="Lương mới (₫/tháng game)" type="number" min={0} step={1000} value={editingSalary.value} onChange={(ev) => setEditingSalary({ ...editingSalary, value: ev.target.value })} />
                                      <GameInput label="Lý do (tuỳ chọn)" value={editingSalary.reason} onChange={(ev) => setEditingSalary({ ...editingSalary, reason: ev.target.value })} placeholder="VD: điều chỉnh ngân sách" />
                                      <GameButton
                                        variant="primary"
                                        size="sm"
                                        onClick={() => updateStaffSalary.mutate({ companyId: selectedCompany.id, staffId: s.id, amount: Number(editingSalary.value) || 0, reason: editingSalary.reason })}
                                        disabled={updateStaffSalary.isPending}
                                      >
                                        {updateStaffSalary.isPending ? 'Đang lưu...' : 'Lưu lương'}
                                      </GameButton>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-sky-200 bg-sky-50/30 p-3 lg:max-h-[72vh] lg:overflow-y-auto lg:pr-2">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-sky-900">Đề xuất tuyển dụng AI (tạm thời)</p>
                            {hrAccLoading && <span className="text-[11px] text-slate-500">Đang tải...</span>}
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            <GameInput label="Nhu cầu/vị trí" value={roleFocus} onChange={(e) => setRoleFocus(e.target.value)} placeholder="VD: Kế toán, bán hàng..." />
                            <div className="grid grid-cols-2 gap-2 items-end">
                              <GameInput label="Số lượng" type="number" min={1} max={20} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
                              <GameButton variant="primary" onClick={() => createHiringPlan.mutate(selectedCompany.id)} disabled={createHiringPlan.isPending || selectedCompany.status === 'bankrupt'} className="w-full">
                                {createHiringPlan.isPending ? 'AI đang sắp...' : 'Nhờ AI đề xuất'}
                              </GameButton>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-600">Phiên gợi ý tạm thời: mất khi tuyển thành công, từ chối/loại bỏ hết, hoặc đóng (không lưu trữ lâu dài).</p>
                          {suggestionPlan ? (
                            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-slate-800">Gợi ý: {suggestionPlan.roleFocus} · {suggestionPlan.headcount} người</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="warning">tạm thời</Badge>
                                  <GameButton variant="outline" onClick={() => dismissHiringPlan.mutate({ companyId: selectedCompany.id, planId: suggestionPlan.id })} disabled={dismissHiringPlan.isPending}>{dismissHiringPlan.isPending ? '...' : 'Đóng/Bỏ'}</GameButton>
                                </div>
                              </div>
                              {suggestionPlan.rationale && <p className="text-[11px] text-slate-600">{suggestionPlan.rationale}</p>}
                              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                                {(suggestionPlan.candidates ?? []).map((c: any) => (
                                  <div key={c.id} className="flex flex-col gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                                    <div className="min-w-0">
                                      <div className="font-medium text-slate-800">{c.fullName} · {c.roleTitle} ({c.seniority})</div>
                                      <div className="text-slate-500">Lương đề xuất: {formatMoney(c.proposedSalary?.amount ?? c.proposedSalary ?? 0)} · Fit: {c.fitScore}/100</div>
                                      {c.riskNote && <div className="text-[11px] text-amber-700">Rủi ro: {c.riskNote}</div>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1">
                                      <Badge variant={c.status === 'approved' ? 'success' : 'default'}>{c.status}</Badge>
                                      <GameButton variant="primary" size="sm" onClick={() => decideCandidate.mutate({ companyId: selectedCompany.id, planId: suggestionPlan.id, candidateId: c.id, decision: 'approved' })} disabled={decideCandidate.isPending}>Duyệt</GameButton>
                                      <GameButton variant="outline" size="sm" onClick={() => decideCandidate.mutate({ companyId: selectedCompany.id, planId: suggestionPlan.id, candidateId: c.id, decision: 'rejected' })} disabled={decideCandidate.isPending}>Từ chối</GameButton>
                                    </div>
                                  </div>
                                ))}
                                {(suggestionPlan.candidates ?? []).length === 0 && <p className="text-[11px] text-slate-500">Không còn ứng viên gợi ý.</p>}
                              </div>
                              <GameButton variant="primary" onClick={() => applyHiringPlan.mutate({ companyId: selectedCompany.id, planId: suggestionPlan.id })} disabled={applyHiringPlan.isPending} className="w-full">
                                {applyHiringPlan.isPending ? '...' : 'Áp dụng tuyển (ứng viên đã duyệt)'}
                              </GameButton>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500">Chưa có phiên gợi ý nào. Nhấn “Nhờ AI đề xuất” để tạo gợi ý tạm thời.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {detailTab === 'equity' && (
              <div className="space-y-4">
                {canManage && selectedCompany.status === 'active' && (
                  <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-700">IPO (chủ sở hữu)</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <GameInput label="Mã CK" value={ipoSymbol} onChange={(e) => setIpoSymbol(e.target.value)} placeholder="EFLS" />
                      <GameInput label="Giá CP" type="number" value={ipoPrice} onChange={(e) => setIpoPrice(e.target.value)} />
                      <GameInput label="Tổng CP" type="number" value={ipoShares} onChange={(e) => setIpoShares(e.target.value)} />
                    </div>
                    <GameButton variant="primary" onClick={() => ipoCompany.mutate(selectedCompany.id)} disabled={ipoCompany.isPending || !ipoSymbol.trim()}>
                      {ipoCompany.isPending ? '...' : 'Niêm yết IPO'}
                    </GameButton>
                  </div>
                )}

                {selectedCompany.status === 'ipo' && (
                  <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-3">
                    <p className="text-xs font-semibold text-sky-800">Cổ phần IPO & gọi vốn</p>
                    <p className="text-[11px] text-slate-600">Quản lý thâu tóm và các đợt chào bán cổ phần. Tiền mua cổ phần về quỹ công ty; tỉ lệ cổ đông cập nhật theo cơ chế ai mua trước được trước.</p>
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
                      <p className="text-xs font-semibold text-amber-800">Thâu tóm (&gt;51% cổ phần)</p>
                      <CCCDLookupInput label="CCCD người thâu tóm (để trống nếu là bạn)" value={takeoverBuyerCccd} onChange={setTakeoverBuyerCccd} />
                      <GameButton variant="outline" onClick={() => takeoverCompany.mutate(selectedCompany.id)} disabled={takeoverCompany.isPending}>
                        {takeoverCompany.isPending ? '...' : 'Thực hiện thâu tóm'}
                      </GameButton>
                    </div>

                    {canManage && (
                      <div className="rounded-lg border border-sky-100 bg-white p-2 space-y-2">
                        <p className="text-[11px] font-semibold text-slate-700">Tạo đợt chào bán (chủ sở hữu)</p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <GameInput label="Số cổ phần" type="number" min={1} value={offerTotalShares} onChange={(e) => setOfferTotalShares(e.target.value)} />
                          <GameInput label="Giá/CP (VND)" type="number" min={1} value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} />
                          <GameInput label="Thời hạn (giờ)" type="number" min={1} value={offerHours} onChange={(e) => setOfferHours(e.target.value)} />
                        </div>
                        <GameButton variant="primary" onClick={() => createShareOffering.mutate(selectedCompany.id)} disabled={createShareOffering.isPending}>{createShareOffering.isPending ? '...' : 'Tạo đợt chào bán'}</GameButton>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-700">Danh sách đợt chào bán</p>
                      {(shareOfferings ?? []).length === 0 ? <p className="text-[11px] text-slate-500">Chưa có đợt chào bán.</p> : (shareOfferings ?? []).map((o: any) => {
                        const open = o.status === 'open' && new Date(o.endsAt).getTime() > Date.now() && Number(o.remainingShares) > 0;
                        const qtyStr = buyOfferShares[o.id] ?? '1';
                        return (
                          <div key={o.id} className="rounded-md border border-slate-200 bg-white p-2 text-[11px] space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{formatMoney(o.pricePerShare?.amount ?? 0)}/CP · còn {Number(o.remainingShares).toLocaleString('vi-VN')}/{Number(o.totalShares).toLocaleString('vi-VN')}</span>
                              <Badge variant={open ? 'success' : 'default'}>{open ? 'open' : o.status}</Badge>
                            </div>
                            <div className="text-slate-500">Hết hạn: {new Date(o.endsAt).toLocaleString('vi-VN')}</div>
                            {open && (
                              <div className="flex flex-wrap items-end gap-2">
                                <div className="w-32"><GameInput label="Số CP mua" type="number" min={1} value={qtyStr} onChange={(e) => setBuyOfferShares(prev => ({ ...prev, [o.id]: e.target.value }))} /></div>
                                <GameButton variant="outline" onClick={() => buyShareOffering.mutate({ offeringId: o.id, shares: Number(qtyStr) || 1 })} disabled={buyShareOffering.isPending}>{buyShareOffering.isPending ? '...' : 'Mua'}</GameButton>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedCompany.status !== 'ipo' && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Công ty chưa IPO: các tính năng cổ phần, gọi vốn và thâu tóm sẽ khả dụng sau khi niêm yết.</div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Cổ đông</p>
                  {detailLoading ? (
                    <p className="text-xs text-slate-500">Đang tải cổ đông...</p>
                  ) : topShareholders.length === 0 ? (
                    <p className="text-xs text-slate-500">Chưa có dữ liệu cổ đông.</p>
                  ) : (
                    <div className="overflow-auto max-h-[50vh]">
                      <table className="min-w-[360px] w-full text-xs">
                        <thead className="text-left uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="py-1 pr-2">Cổ đông</th>
                            <th className="py-1 pr-2 text-right">Cổ phần</th>
                            <th className="py-1 text-right">Tỉ lệ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {topShareholders.map((s) => (
                            <tr key={s.characterId}>
                              <td className="py-1 pr-2">
                                {s.characterName}
                                {s.isOwner && <span className="ml-1 text-[10px] font-semibold text-emerald-700">(CT)</span>}
                                {s.isMe && <span className="ml-1 text-[10px] font-semibold text-sky-700">(bạn)</span>}
                              </td>
                              <td className="py-1 pr-2 text-right font-mono">{s.shares.toLocaleString('vi-VN')}</td>
                              <td className="py-1 text-right font-mono">{s.percentage.toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      <TransactionConfirmModal
        open={!!confirmCreate}
        onClose={() => { if (!createCompany.isPending) setConfirmCreate(null); }}
        onConfirm={async () => {
          if (!confirmCreate) return;
          await createCompany.mutateAsync({ idempotencyKey: confirmCreate.idempotencyKey });
        }}
        loading={createCompany.isPending}
        title="Xác nhận thành lập công ty"
        transactionType="Thành lập công ty"
        targetLabel="Công ty"
        targetValue={confirmCreate ? `${confirmCreate.name} · ${industryLabel(confirmCreate.industry)}` : ''}
        amountLabel="Vốn khởi điểm"
        amountMinor={confirmCreate?.capital}
        feeOrRateValue="Phí/Lãi suất: Không áp dụng"
        projectedBalanceLabel="Số dư tiền mặt dự kiến sau giao dịch"
        projectedBalanceMinor={typeof (me as any)?.cash?.amount === 'number' && confirmCreate ? Math.max(0, Number((me as any).cash.amount) - confirmCreate.capital) : undefined}
        details={confirmCreate ? [{ label: 'Địa điểm/cơ sở', value: confirmCreate.premisesLabel }] : []}
        warning="Hành động thành lập công ty không thể hoàn tác. Hệ thống sẽ kiểm tra vốn, địa điểm/cơ sở và điều kiện hợp lệ khi thực hiện."
      />
    </div>
  );
}



