import { ModulePlaceholder } from '../shared/ui/ModulePlaceholder';

export function UnderworldPage() {
  return (
    <ModulePlaceholder
      title="Chợ đen & Thám tử"
      description="Bằng chứng, tống tiền, gài bẫy, thuê giang hồ và quản lý Heat Level."
      capabilities={[
        {
          title: 'Thám tử tư',
          body: 'Nhận hợp đồng điều tra, mua thiết bị và thu thập bằng chứng.',
        },
        { title: 'Bằng chứng', body: 'Tố giác, bán cho khách hoặc dùng để tống tiền.' },
        { title: 'Blackmail', body: 'Hợp đồng ngầm trả phí im lặng định kỳ.' },
        { title: 'Sting operation', body: 'Gài bẫy bằng tiền đánh dấu để cảnh sát bắt quả tang.' },
        { title: 'Heist & sabotage', body: 'Trộm hồ sơ, phá hoại cơ sở kinh doanh.' },
        { title: 'Heat & phòng thủ', body: 'Càn quét toàn server, bảo hiểm và vệ sĩ.' },
      ]}
    >
      <div className="rounded-xl border border-amber-200/60 bg-amber-50 p-4 text-xs text-amber-800/90">
        Cảnh báo: mọi hành động phi pháp đều làm tăng Heat Level và có thể kích hoạt Đại án Công an
        trên toàn server.
      </div>
    </ModulePlaceholder>
  );
}
