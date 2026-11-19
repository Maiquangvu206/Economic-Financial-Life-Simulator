-- 0066: Khơi thông vòng kinh tế khởi đầu cho người chơi mới (500.000 ₫)
-- - Khóa học nghề/chứng chỉ cơ bản học phí 150.000–300.000 ₫ hoặc miễn phí nhập môn
-- - Công ty nhà nước/khởi điểm và tin tuyển dụng cơ bản (không yêu cầu bằng cấp cao)
-- Forward-only, idempotent inserts.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Giáo dục: khóa học/chứng chỉ khởi điểm phù hợp vốn 500.000 ₫
-- ---------------------------------------------------------------------------
INSERT INTO universities (id, name, degree_code, field, tuition_minor, duration_months, stat_bonus)
VALUES
  (
    '11111111-1111-4111-8111-000000000101',
    'Trung tâm Dạy nghề Khởi nghiệp Hà Nội',
    'vocational_basic',
    'Giáo dục',
    0,
    1,
    '{"creditScore": 2, "salaryBonusPct": 2}'::jsonb
  ),
  (
    '11111111-1111-4111-8111-000000000102',
    'Học viện Kỹ năng Số Cơ bản',
    'digital_skills_basic',
    'Công nghệ - Trí tuệ nhân tạo',
    200000,
    1,
    '{"creditScore": 3, "salaryBonusPct": 4}'::jsonb
  ),
  (
    '11111111-1111-4111-8111-000000000103',
    'Trung tâm Chứng chỉ Hành chính - Văn phòng',
    'office_admin_basic',
    'Giáo dục',
    300000,
    1,
    '{"creditScore": 3, "salaryBonusPct": 3}'::jsonb
  )
ON CONFLICT (degree_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Công ty nhà nước / khởi điểm (để gắn tin tuyển dụng cơ bản)
--    Chọn chủ sở hữu hợp lệ hiện có (ưu tiên quản trị hệ thống).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT id INTO v_owner
  FROM characters
  WHERE id = '00000000-0000-4000-8000-0000000000c2'
     OR id = '00000000-0000-4000-8000-0000000000c1'
  ORDER BY (id = '00000000-0000-4000-8000-0000000000c2') DESC
  LIMIT 1;

  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM characters ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_owner IS NULL THEN
    RAISE NOTICE '0066: Không tìm thấy character để làm chủ sở hữu công ty khởi điểm, bỏ qua tạo companies/jobs gắn công ty.';
    RETURN;
  END IF;

  INSERT INTO companies (id, name, industry, owner_character_id, cash_minor, valuation_minor, status, ticker_symbol)
  VALUES
    (
      '55555555-5555-4555-8555-000000000101',
      'Trung tâm Dịch vụ Công Hà Nội',
      'Giáo dục',
      v_owner,
      50000000,
      120000000,
      'active',
      NULL
    ),
    (
      '55555555-5555-4555-8555-000000000102',
      'Xí nghiệp Hậu cần Đô thị',
      'Hậu cần',
      v_owner,
      60000000,
      150000000,
      'active',
      NULL
    ),
    (
      '55555555-5555-4555-8555-000000000103',
      'Công ty Khởi nghiệp Nông nghiệp Xanh',
      'Công nghệ nông nghiệp',
      v_owner,
      30000000,
      90000000,
      'active',
      NULL
    )
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 3) Tin tuyển dụng cơ bản cho người chơi mới (không yêu cầu bằng cấp cao)
  -- -------------------------------------------------------------------------
  INSERT INTO jobs (
    id, employer_company_id, title, industry, base_salary_minor,
    required_degree, min_credit_score, energy_cost, openings, posting_status
  )
  VALUES
    (
      '22222222-2222-4222-8222-000000000101',
      '55555555-5555-4555-8555-000000000101',
      'Nhân viên Hỗ trợ Hành chính (Nhà nước)',
      'Giáo dục',
      220000,
      NULL,
      500,
      8,
      10,
      'open'
    ),
    (
      '22222222-2222-4222-8222-000000000102',
      '55555555-5555-4555-8555-000000000102',
      'Nhân viên Kho vận Cơ bản',
      'Hậu cần',
      240000,
      NULL,
      500,
      10,
      10,
      'open'
    ),
    (
      '22222222-2222-4222-8222-000000000103',
      '55555555-5555-4555-8555-000000000103',
      'Cộng tác viên Nông nghiệp Xanh (Khởi điểm)',
      'Công nghệ nông nghiệp',
      210000,
      NULL,
      480,
      8,
      8,
      'open'
    ),
    (
      '22222222-2222-4222-8222-000000000104',
      '55555555-5555-4555-8555-000000000101',
      'Nhân viên Chăm sóc Cộng đồng',
      'Y tế - Dược phẩm',
      230000,
      NULL,
      500,
      9,
      6,
      'open'
    )
  ON CONFLICT (id) DO NOTHING;
END $$;

COMMIT;