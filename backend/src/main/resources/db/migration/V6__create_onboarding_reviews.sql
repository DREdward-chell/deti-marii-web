-- A review has its own lifecycle, independent of paperwork, learning and role admissions.
CREATE TABLE onboarding.review (
    volunteer_id UUID PRIMARY KEY REFERENCES volunteers.volunteer_profile(id),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

-- Immutable snapshots also provide the coordinator's contact/decision history.
CREATE TABLE onboarding.review_revision (
    volunteer_id UUID NOT NULL REFERENCES onboarding.review(volunteer_id),
    version BIGINT NOT NULL CHECK (version > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('NEW', 'IN_REVIEW', 'CONTINUE', 'PAUSED', 'DECLINED')),
    message VARCHAR(2000) NOT NULL CHECK (length(trim(message)) > 0),
    next_step VARCHAR(500) NOT NULL DEFAULT '',
    next_step_owner VARCHAR(20) CHECK (next_step_owner IN ('VOLUNTEER', 'COORDINATOR')),
    next_step_date DATE,
    internal_note VARCHAR(4000) NOT NULL DEFAULT '',
    actor_id UUID NOT NULL REFERENCES identity.account(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (volunteer_id, version),
    CHECK ((next_step = '' AND next_step_owner IS NULL AND next_step_date IS NULL)
        OR (length(trim(next_step)) > 0 AND next_step_owner IS NOT NULL))
);
