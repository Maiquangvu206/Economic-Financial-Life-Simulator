import { ModulePlaceholder } from '../shared/ui/ModulePlaceholder';

export function LawPage() {
  return (
    <ModulePlaceholder
      title="Pháp lý & Tòa án"
      description="Tranh tụng với AI Thẩm phán, bằng chứng, hợp đồng hôn nhân và thừa kế."
      capabilities={[
        { title: 'Phiên tòa', body: 'Chat tranh tụng realtime trong courtroom_session.' },
        { title: 'AI Thẩm phán', body: 'AI chỉ đề xuất; core kiểm tra bằng chứng và luật.' },
        { title: 'Bằng chứng', body: 'Thu thập, chất lượng, sử dụng và tính hợp lệ.' },
        { title: 'Hôn nhân', body: 'Kết hôn, prenup và phân chia tài sản.' },
        { title: 'Thừa kế', body: 'Di chúc, trust fund và thuế thừa kế.' },
        { title: 'Audit thuế', body: 'Rủi ro thanh tra dựa trên sổ sách và heat.' },
      ]}
    />
  );
}
