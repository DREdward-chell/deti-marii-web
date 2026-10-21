-- Spring Modulith 2.1.1 JDBC registry, current PostgreSQL schema (completion-mode=update).
-- Infrastructure metadata lives in public; business modules own their own schemas.
-- https://docs.spring.io/spring-modulith/reference/appendix.html
CREATE TABLE public.event_publication (
    id UUID PRIMARY KEY,
    listener_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    serialized_event TEXT NOT NULL,
    publication_date TIMESTAMP WITH TIME ZONE NOT NULL,
    completion_date TIMESTAMP WITH TIME ZONE,
    status TEXT,
    completion_attempts INT,
    last_resubmission_date TIMESTAMP WITH TIME ZONE
);

CREATE INDEX event_publication_serialized_event_hash_idx
    ON public.event_publication USING hash (serialized_event);
CREATE INDEX event_publication_by_completion_date_idx
    ON public.event_publication (completion_date);
