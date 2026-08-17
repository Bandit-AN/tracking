UPDATE "workspaces"
SET
  "avatar" = '/seller-syndicate-logo.png',
  "updated_at" = now()
WHERE lower(trim("name")) = 'seller syndicate'
  AND "avatar" IS DISTINCT FROM '/seller-syndicate-logo.png';
