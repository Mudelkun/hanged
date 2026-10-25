-- Staff roles (developer accounts, Context/dev-accounts.md): null for every
-- regular player. Set only from the admin page (ADMIN_TOKEN), never by a sync.
-- What each role allows lives in roles.ts, so a new role needs no migration.
ALTER TABLE players ADD COLUMN role text;
CREATE INDEX players_role ON players (role) WHERE role IS NOT NULL;
