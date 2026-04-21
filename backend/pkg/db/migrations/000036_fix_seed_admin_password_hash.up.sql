-- Repair the stale bcrypt hash that shipped in backend/scripts/seed_all.sql
-- before this change. Existing databases seeded via `make seed-all` carried
-- `$2b$12$npOZArrFi4NNiLyXGMNase95Ij0Wm6o1d3xE7gR91jLMgzAb8yVCG` which, despite
-- the "password: admin123" comment, does NOT actually verify against
-- "admin123" (see bcrypt.CompareHashAndPassword). We only overwrite rows that
-- still carry the stale value so rotated passwords are preserved.
--
-- The replacement hash is the same value used in migration 000001_initial
-- (`$2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S`), which has
-- been verified to authenticate "admin123".

UPDATE dm3_auth.accounts
   SET password_hash  = '$2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S',
       failed_attempts = 0,
       locked_until    = NULL,
       updated_at      = NOW()
 WHERE password_hash = '$2b$12$npOZArrFi4NNiLyXGMNase95Ij0Wm6o1d3xE7gR91jLMgzAb8yVCG';
