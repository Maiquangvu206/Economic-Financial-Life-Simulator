# map-editor

Quy hoạch vùng, đơn giá đất $/m², hệ số mặt tiền và tuyến giao thông.

- Ghi qua transaction `PUT /api/v1/admin/map/nodes` (dự kiến), có version.
- Không cho phép sửa trực tiếp bảng `properties` của người chơi.
- Thay đổi quy hoạch phát event `map.zone.changed.v1` để worker tính lại giá.
