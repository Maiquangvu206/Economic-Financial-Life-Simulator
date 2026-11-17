-- 0065_industry_field_vietnamese.sql
-- Chuyển toàn bộ dữ liệu ngành/lĩnh vực sang tiếng Việt (không dùng mã tiếng Anh).
-- Forward-only, idempotent.

BEGIN;

UPDATE jobs SET industry = CASE industry
  WHEN 'education' THEN 'Giáo dục'
  WHEN 'energy_mining' THEN 'Năng lượng - Khoáng sản'
  WHEN 'finance_banking' THEN 'Tài chính - Ngân hàng'
  WHEN 'logistics' THEN 'Hậu cần'
  WHEN 'real_estate' THEN 'Bất động sản'
  WHEN 'technology_ai' THEN 'Công nghệ - Trí tuệ nhân tạo'
  WHEN 'agritech' THEN 'Công nghệ nông nghiệp'
  WHEN 'healthcare_pharma' THEN 'Y tế - Dược phẩm'
  WHEN 'entertainment_media' THEN 'Giải trí - Truyền thông'
  WHEN 'underworld_services' THEN 'Dịch vụ thế giới ngầm'
  ELSE industry END;

UPDATE universities SET field = CASE field
  WHEN 'education' THEN 'Giáo dục'
  WHEN 'energy_mining' THEN 'Năng lượng - Khoáng sản'
  WHEN 'finance_banking' THEN 'Tài chính - Ngân hàng'
  WHEN 'logistics' THEN 'Hậu cần'
  WHEN 'real_estate' THEN 'Bất động sản'
  WHEN 'technology_ai' THEN 'Công nghệ - Trí tuệ nhân tạo'
  WHEN 'agritech' THEN 'Công nghệ nông nghiệp'
  WHEN 'healthcare_pharma' THEN 'Y tế - Dược phẩm'
  WHEN 'entertainment_media' THEN 'Giải trí - Truyền thông'
  WHEN 'underworld_services' THEN 'Dịch vụ thế giới ngầm'
  ELSE field END;

UPDATE companies SET industry = CASE industry
  WHEN 'education' THEN 'Giáo dục'
  WHEN 'energy_mining' THEN 'Năng lượng - Khoáng sản'
  WHEN 'finance_banking' THEN 'Tài chính - Ngân hàng'
  WHEN 'logistics' THEN 'Hậu cần'
  WHEN 'real_estate' THEN 'Bất động sản'
  WHEN 'technology_ai' THEN 'Công nghệ - Trí tuệ nhân tạo'
  WHEN 'agritech' THEN 'Công nghệ nông nghiệp'
  WHEN 'healthcare_pharma' THEN 'Y tế - Dược phẩm'
  WHEN 'entertainment_media' THEN 'Giải trí - Truyền thông'
  WHEN 'underworld_services' THEN 'Dịch vụ thế giới ngầm'
  ELSE industry END;

UPDATE industry_revenue_configs SET industry_type = CASE industry_type
  WHEN 'education' THEN 'Giáo dục'
  WHEN 'energy_mining' THEN 'Năng lượng - Khoáng sản'
  WHEN 'finance_banking' THEN 'Tài chính - Ngân hàng'
  WHEN 'logistics' THEN 'Hậu cần'
  WHEN 'real_estate' THEN 'Bất động sản'
  WHEN 'technology_ai' THEN 'Công nghệ - Trí tuệ nhân tạo'
  WHEN 'agritech' THEN 'Công nghệ nông nghiệp'
  WHEN 'healthcare_pharma' THEN 'Y tế - Dược phẩm'
  WHEN 'entertainment_media' THEN 'Giải trí - Truyền thông'
  WHEN 'underworld_services' THEN 'Dịch vụ thế giới ngầm'
  ELSE industry_type END;

COMMIT;