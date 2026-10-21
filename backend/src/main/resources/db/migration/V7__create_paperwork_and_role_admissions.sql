CREATE TABLE onboarding.volunteer_role (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL CHECK (length(trim(name)) > 0),
    description VARCHAR(1000) NOT NULL DEFAULT '',
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE UNIQUE INDEX volunteer_role_unique_name ON onboarding.volunteer_role (lower(name));

CREATE TABLE onboarding.volunteer_role_revision (
    role_id UUID NOT NULL REFERENCES onboarding.volunteer_role(id),
    version BIGINT NOT NULL CHECK (version >= 0),
    name VARCHAR(100) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    actor_id UUID NOT NULL REFERENCES identity.account(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (role_id, version)
);

CREATE TABLE onboarding.paperwork (
    volunteer_id UUID PRIMARY KEY REFERENCES volunteers.volunteer_profile(id),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE TABLE onboarding.paperwork_revision (
    volunteer_id UUID NOT NULL REFERENCES onboarding.paperwork(volunteer_id),
    version BIGINT NOT NULL CHECK (version > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('NOT_CONFIRMED', 'CONFIRMED', 'NEEDS_UPDATE')),
    message VARCHAR(2000) NOT NULL CHECK (length(trim(message)) > 0),
    internal_note VARCHAR(4000) NOT NULL DEFAULT '',
    actor_id UUID NOT NULL REFERENCES identity.account(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (volunteer_id, version)
);

CREATE TABLE onboarding.role_admission (
    volunteer_id UUID NOT NULL REFERENCES volunteers.volunteer_profile(id),
    role_id UUID NOT NULL REFERENCES onboarding.volunteer_role(id),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    PRIMARY KEY (volunteer_id, role_id)
);
CREATE TABLE onboarding.role_admission_revision (
    volunteer_id UUID NOT NULL,
    role_id UUID NOT NULL,
    version BIGINT NOT NULL CHECK (version > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('NOT_GRANTED', 'GRANTED', 'SUSPENDED', 'REVOKED')),
    message VARCHAR(2000) NOT NULL CHECK (length(trim(message)) > 0),
    internal_note VARCHAR(4000) NOT NULL DEFAULT '',
    actor_id UUID NOT NULL REFERENCES identity.account(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (volunteer_id, role_id, version),
    FOREIGN KEY (volunteer_id, role_id) REFERENCES onboarding.role_admission(volunteer_id, role_id)
);
