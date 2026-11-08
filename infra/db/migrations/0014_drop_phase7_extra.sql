-- Phase 7 scope reduction: bỏ derivatives / cross-server / spatial,
-- DROP các bảng đã tạo ở bản 0013 cũ (nếu DB hiện tại còn chứa chúng).
BEGIN;

DROP TABLE IF EXISTS spatial_presences;
DROP TABLE IF EXISTS spatial_sessions;
DROP TABLE IF EXISTS cross_server_listings;
DROP TABLE IF EXISTS futures_contracts;

COMMIT;
