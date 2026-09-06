CREATE TABLE polls (
  id uuid PRIMARY KEY,
  author_person text NOT NULL,
  doc jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL
);
CREATE TABLE events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  poll_id uuid NOT NULL REFERENCES polls(id),
  kind text NOT NULL,
  reason text NOT NULL,
  actor_role text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE appeals (
  id uuid PRIMARY KEY,
  poll_id uuid NOT NULL REFERENCES polls(id),
  author_person text NOT NULL,
  reason text NOT NULL,
  resolution text,
  state text NOT NULL CHECK(state IN ('Open','Resolved'))
);
