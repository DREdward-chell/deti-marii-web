ALTER TABLE identity.account
    ADD COLUMN security_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN login_code_sent_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE identity.staff_access_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES identity.account (id),
    action VARCHAR(16) NOT NULL CHECK (action IN ('grant', 'revoke')),
    operator_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX volunteer_profile_created_idx ON volunteers.volunteer_profile (created_at DESC, id);
