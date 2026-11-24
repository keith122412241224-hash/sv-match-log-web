-- Preserve the immutable v2 snapshot envelope; v3 assessments require manual review.
alter table public.environment_review_runs add constraint environment_review_v3_manual
check (analysis->>'reviewVersion' is distinct from '3' or mode = 'manual');
