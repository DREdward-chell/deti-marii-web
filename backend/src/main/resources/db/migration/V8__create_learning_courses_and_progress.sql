CREATE TABLE learning.course (
    id UUID PRIMARY KEY,
    draft JSONB NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    published_version INTEGER,
    published_revision BIGINT,
    publication_count INTEGER NOT NULL DEFAULT 0 CHECK (publication_count >= 0),
    updated_by UUID NOT NULL REFERENCES identity.account(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((published_version IS NULL) = (published_revision IS NULL))
);
CREATE TABLE learning.course_version (
    course_id UUID NOT NULL REFERENCES learning.course(id),
    version INTEGER NOT NULL CHECK (version > 0),
    source_revision BIGINT NOT NULL,
    content JSONB NOT NULL,
    published_by UUID NOT NULL REFERENCES identity.account(id),
    published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (course_id, version)
);
ALTER TABLE learning.course ADD CONSTRAINT course_current_publication
    FOREIGN KEY (id, published_version) REFERENCES learning.course_version(course_id, version);
CREATE TABLE learning.course_action (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id UUID NOT NULL REFERENCES learning.course(id),
    action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'SAVE', 'PUBLISH', 'WITHDRAW')),
    draft_revision BIGINT NOT NULL,
    publication_version INTEGER,
    actor_id UUID NOT NULL REFERENCES identity.account(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE learning.enrollment (
    id UUID PRIMARY KEY,
    volunteer_id UUID NOT NULL REFERENCES volunteers.volunteer_profile(id),
    course_id UUID NOT NULL,
    course_version INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    FOREIGN KEY (course_id, course_version) REFERENCES learning.course_version(course_id, version),
    UNIQUE (volunteer_id, course_id, course_version)
);
CREATE TABLE learning.lesson_attempt (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_id UUID NOT NULL REFERENCES learning.enrollment(id),
    request_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    answer JSONB NOT NULL,
    correct BOOLEAN NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (enrollment_id, request_id)
);
CREATE INDEX lesson_attempt_progress ON learning.lesson_attempt(enrollment_id, lesson_id, id DESC);
