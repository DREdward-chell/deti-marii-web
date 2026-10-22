CREATE TABLE notifications.telegram_link (
    account_id UUID PRIMARY KEY REFERENCES identity.account(id),
    chat_id BIGINT UNIQUE,
    token_hash VARCHAR(64) UNIQUE,
    expires_at TIMESTAMPTZ,
    linked_at TIMESTAMPTZ
);
CREATE TABLE notifications.telegram_outbox (
    id UUID PRIMARY KEY,
    deduplication_key TEXT NOT NULL UNIQUE,
    account_id UUID REFERENCES identity.account(id),
    chat_id BIGINT NOT NULL,
    message TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    state VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'SENT', 'FAILED', 'CANCELLED'))
);
CREATE INDEX telegram_pending ON notifications.telegram_outbox(available_at) WHERE state = 'PENDING';
CREATE TABLE notifications.telegram_cursor (
    id INT PRIMARY KEY CHECK (id = 1),
    next_update BIGINT NOT NULL DEFAULT 0
);
INSERT INTO notifications.telegram_cursor(id) VALUES (1);
