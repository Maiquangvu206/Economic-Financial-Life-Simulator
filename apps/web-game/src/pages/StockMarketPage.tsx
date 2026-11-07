import { ModulePlaceholder } from '../shared/ui/ModulePlaceholder';

export function StockMarketPage() {
  return (
    <ModulePlaceholder
      title="Sàn Chứng khoán"
      description="Đồ thị nến realtime, sổ lệnh, khớp lệnh price-time priority và cổ tức."
      capabilities={[
        { title: 'Biểu đồ nến', body: 'Lightweight Charts nhận tick qua stock_market_room.' },
        { title: 'Sổ lệnh', body: 'Order book bids/asks đồng bộ từ server.' },
        { title: 'Đặt lệnh', body: 'Mua/bán, trạng thái khớp một phần và hủy lệnh.' },
        { title: 'Danh mục', body: 'Cổ phiếu nắm giữ, giá vốn và lãi/lỗ.' },
        { title: 'Cổ tức', body: 'Chia cổ tức định kỳ theo tỷ lệ sở hữu.' },
        { title: 'Tin tức', body: 'Tin AI tạo ra có thể tác động giá trong biên cho phép.' },
      ]}
    />
  );
}
