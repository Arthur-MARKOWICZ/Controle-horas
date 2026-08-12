UPDATE users
SET role = 'ADMIN'
WHERE role = 'USER'
  AND manager_id IS NULL;
