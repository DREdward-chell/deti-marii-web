CREATE TABLE identity.account (
    id UUID PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE identity.account_role (
    account_id UUID NOT NULL REFERENCES identity.account (id),
    role VARCHAR(32) NOT NULL CHECK (role IN ('VOLUNTEER', 'COORDINATOR', 'ADMIN')),
    PRIMARY KEY (account_id, role)
);

CREATE TABLE volunteers.volunteer_profile (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL UNIQUE REFERENCES identity.account (id),
    display_name VARCHAR(100) NOT NULL CHECK (length(btrim(display_name)) > 0),
    phone VARCHAR(40) NOT NULL DEFAULT '',
    interests VARCHAR(1000) NOT NULL DEFAULT '',
    skills VARCHAR(1000) NOT NULL DEFAULT '',
    availability VARCHAR(500) NOT NULL DEFAULT '',
    regularity VARCHAR(32) NOT NULL CHECK (regularity IN ('UNSURE', 'ONE_OFF', 'REGULAR')),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
