import { ModulePlaceholder } from '../shared/ui/ModulePlaceholder';

export function RealEstatePage() {
  return (
    <ModulePlaceholder
      title="Bất động sản"
      description="Mua bán, cho thuê, xây dựng, thế chấp và đấu giá tài sản phát mại."
      capabilities={[
        { title: 'Danh mục BĐS', body: 'Đất nền, căn hộ, thương mại; diện tích và mặt tiền.' },
        { title: 'Cho thuê', body: 'Hợp đồng thuê, dòng tiền thụ động và tỷ lệ trống.' },
        { title: 'Xây dựng', body: 'Cải tạo, số tầng, phòng và chi phí bảo trì.' },
        { title: 'Thế chấp', body: 'Định giá tài sản bảo đảm và hạn mức vay.' },
        { title: 'Đấu giá', body: 'Phiên đấu giá công khai tài sản nợ xấu.' },
        { title: 'Quy hoạch', body: 'Giá đất theo vùng, mặt tiền và tuyến giao thông.' },
      ]}
    />
  );
}
