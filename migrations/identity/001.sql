CREATE TABLE persons (
  person text PRIMARY KEY,
  attributes jsonb NOT NULL,
  role text NOT NULL CHECK (role IN ('participant','moderator')),
  revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE attempts (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('A','B')),
  subject text NOT NULL,
  challenge text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  completed boolean NOT NULL DEFAULT false
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  person text NOT NULL REFERENCES persons(person),
  expires_at timestamptz NOT NULL
);
CREATE TABLE credentials (
  poll_id text NOT NULL,
  person text NOT NULL REFERENCES persons(person),
  credential_sealed text NOT NULL,
  manifest_hash text NOT NULL,
  closes_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  PRIMARY KEY(poll_id, person)
);
CREATE TABLE roster_locks (poll_id text PRIMARY KEY, manifest_hash text NOT NULL, credential_count integer NOT NULL);
