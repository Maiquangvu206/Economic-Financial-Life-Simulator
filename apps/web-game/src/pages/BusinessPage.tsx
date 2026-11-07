import { ModulePlaceholder } from '../shared/ui/ModulePlaceholder';

export function BusinessPage() {
  return (
    <ModulePlaceholder
      title="Doanh nghiệp"
      description="Thành lập công ty, tuyển dụng, OPEX, IPO và thâu tóm doanh nghiệp."
      capabilities={[
        { title: 'Vòng đời công ty', body: 'Thành lập, mở rộng, tái cơ cấu và giải thể.' },
        { title: 'Nhân sự & OPEX', body: 'NPC/người chơi, lương, năng suất và chi phí vận hành.' },
        { title: 'Chỉ số ngành', body: 'Cyclical index, biên lợi nhuận và rủi ro pháp lý.' },
        { title: 'IPO', body: 'Điều kiện niêm yết, định giá và pha loãng cổ phần.' },
        { title: 'Quản trị', body: 'HĐQT, cổ đông lớn và quyền kiểm soát.' },
        { title: 'Hostile takeover', body: 'Sở hữu trên 51% để giành quyền kiểm soát.' },
      ]}
    />
  );
}
