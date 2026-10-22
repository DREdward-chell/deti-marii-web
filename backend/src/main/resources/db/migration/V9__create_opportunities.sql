CREATE TABLE opportunities.opportunity (
    id UUID PRIMARY KEY,
    draft JSONB NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    published_version INTEGER,
    published_revision BIGINT,
    publication_count INTEGER NOT NULL DEFAULT 0 CHECK (publication_count >= 0),
    updated_by UUID NOT NULL REFERENCES identity.account(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((published_version IS NULL) = (published_revision IS NULL)),
    CHECK (published_version > 0 AND published_version <= publication_count),
    CHECK (published_revision >= 0 AND published_revision <= revision)
);
CREATE TABLE opportunities.opportunity_version (
    opportunity_id UUID NOT NULL REFERENCES opportunities.opportunity(id),
    version INTEGER NOT NULL CHECK (version > 0),
    source_revision BIGINT NOT NULL CHECK (source_revision >= 0),
    content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
    role_id UUID GENERATED ALWAYS AS ((content->>'roleId')::uuid) STORED NOT NULL
        REFERENCES onboarding.volunteer_role(id),
    published_by UUID NOT NULL REFERENCES identity.account(id),
    published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (opportunity_id, version)
);
ALTER TABLE opportunities.opportunity ADD CONSTRAINT opportunity_current_publication
    FOREIGN KEY (id, published_version) REFERENCES opportunities.opportunity_version(opportunity_id, version);
CREATE TABLE opportunities.opportunity_action (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opportunity_id UUID NOT NULL REFERENCES opportunities.opportunity(id),
    action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'SAVE', 'PUBLISH', 'WITHDRAW')),
    draft_revision BIGINT NOT NULL CHECK (draft_revision >= 0),
    publication_version INTEGER CHECK (publication_version > 0),
    actor_id UUID NOT NULL REFERENCES identity.account(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (opportunity_id, publication_version) REFERENCES opportunities.opportunity_version(opportunity_id, version)
);
CREATE INDEX opportunity_publication_order ON opportunities.opportunity_version(published_at DESC, opportunity_id);
