-- 0052: Chuẩn hóa mốc thời gian cơ chế game theo chuẩn 1 ngày game = 1 phút thực tế
-- (1 tháng game = 30 ngày game = 30 phút thực)
BEGIN;

-- Học tập: bằng cấp đang học -> tốt nghiệp theo thời lượng game
UPDATE degrees d
SET graduates_at = now() + (u.duration_months * interval '30 minutes'),
    enrolled_at = CASE WHEN d.enrolled_at > now() THEN now() ELSE d.enrolled_at END
FROM universities u
WHERE d.university_id = u.id AND d.status = 'enrolled';

-- Bài test tốt nghiệp sớm còn hiệu lực: giới hạn cửa sổ theo thời gian game (tối đa 30 phút thực)
UPDATE education_early_grad_tests
SET expires_at = LEAST(expires_at, now() + interval '30 minutes')
WHERE status = 'pending' AND expires_at > now();

-- Tiết kiệm có kỳ hạn: đáo hạn theo tháng game
UPDATE savings_deposits
SET matures_at = now() + (term_months * interval '30 minutes')
WHERE status = 'active' AND term_months > 0;

-- Thuê BĐS: kỳ thu tiếp theo theo tháng game
UPDATE leases
SET next_due_at = now() + interval '30 minutes'
WHERE status = 'active';

-- Khoản vay: kỳ hạn/lãi/ân hạn theo tháng game
UPDATE loans
SET next_due_at = now() + interval '30 minutes',
    grace_period_end = GREATEST(grace_period_end, now() + interval '30 minutes'),
    updated_at = now()
WHERE status IN ('active', 'grace', 'defaulted');

INSERT INTO schema_migrations (filename) VALUES ('0052_normalize_game_time_durations.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
