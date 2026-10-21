#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 || ( "$1" != grant && "$1" != revoke ) || -z "$2" || -z "$3" ]]; then
  echo 'Usage: bash scripts/coordinator-access.sh grant|revoke EMAIL OPERATOR' >&2
  exit 2
fi

cd "$(dirname "$0")/.."
# No public role-management endpoint. The operator needs access to the deployment database.
# psql variables are SQL-quoted with :'name', never interpolated into the SQL source.
docker compose exec -T postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 "$@"' sh \
  -v target_email="$2" -v access_action="$1" -v operator_name="$3" <<'SQL'
BEGIN;
SELECT id AS target_id FROM identity.account WHERE email = lower(btrim(:'target_email')) FOR UPDATE \gset
INSERT INTO identity.account_role (account_id, role)
SELECT :'target_id'::uuid, 'COORDINATOR' WHERE :'access_action' = 'grant'
ON CONFLICT DO NOTHING;
DELETE FROM identity.account_role
WHERE account_id = :'target_id'::uuid AND role = 'COORDINATOR' AND :'access_action' = 'revoke';
UPDATE identity.account SET security_version = security_version + 1 WHERE id = :'target_id'::uuid;
INSERT INTO identity.staff_access_audit (account_id, action, operator_name)
VALUES (:'target_id'::uuid, :'access_action', :'operator_name');
COMMIT;
SQL
