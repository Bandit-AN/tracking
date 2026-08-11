UPDATE neon_auth."user" AS auth_user
SET role = 'admin'
FROM portal_users AS portal_user
WHERE portal_user.auth_user_id = auth_user.id::text
  AND portal_user.role = 'admin'
  AND auth_user.role IS DISTINCT FROM 'admin';
