-- One database, explicit ownership of future domain tables.
-- Flyway history remains in public; cross-schema foreign keys are allowed.
CREATE SCHEMA identity;
CREATE SCHEMA volunteers;
CREATE SCHEMA onboarding;
CREATE SCHEMA opportunities;
CREATE SCHEMA participation;
CREATE SCHEMA coordination;
CREATE SCHEMA notifications;
