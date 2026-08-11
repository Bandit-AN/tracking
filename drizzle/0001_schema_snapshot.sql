-- The production-safe custom migration in 0000 creates and upgrades the
-- schema. This no-op records the matching Drizzle snapshot so future generated
-- migrations diff from the real production baseline.
SELECT 1;
