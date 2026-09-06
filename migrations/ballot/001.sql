CREATE TABLE elections (
  id text PRIMARY KEY,
  manifest_raw text NOT NULL,
  manifest_hash text NOT NULL,
  archive text NOT NULL,
  state text NOT NULL CHECK (state IN ('Scheduled','Open','Closed','Published','ResultsSuppressed','Cancelled','Invalidated')),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  threshold integer NOT NULL CHECK (threshold >= 3),
  final_archive text,
  result jsonb
);
CREATE TABLE ballots (
  poll_id text NOT NULL REFERENCES elections(id),
  credential text NOT NULL,
  tracker text NOT NULL,
  receipt jsonb NOT NULL,
  PRIMARY KEY(poll_id, credential),
  UNIQUE(poll_id, tracker)
);
CREATE TABLE checkpoints (
  poll_id text NOT NULL REFERENCES elections(id),
  sequence integer NOT NULL,
  envelope jsonb NOT NULL,
  PRIMARY KEY(poll_id, sequence)
);
CREATE TABLE shares (
  poll_id text NOT NULL REFERENCES elections(id),
  trustee_id integer NOT NULL CHECK (trustee_id BETWEEN 1 AND 4),
  share text NOT NULL,
  PRIMARY KEY(poll_id, trustee_id)
);
