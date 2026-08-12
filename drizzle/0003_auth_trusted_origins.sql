UPDATE neon_auth.project_config
SET trusted_origins = (
  SELECT jsonb_agg(origin ORDER BY origin)
  FROM (
    SELECT DISTINCT value AS origin
    FROM jsonb_array_elements_text(
      COALESCE(neon_auth.project_config.trusted_origins, '[]'::jsonb)
    )
    UNION
    SELECT 'https://app.moonriftmedia.com'
    UNION
    SELECT 'https://tracking-five-beta.vercel.app'
  ) AS allowed_origins
),
updated_at = now();
