-- psql $DATABASE_URL -f schema.sql
CREATE TABLE couples (
  id          SERIAL PRIMARY KEY,
  invite_code TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  couple_id     INT REFERENCES couples(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));
CREATE INDEX users_couple_idx ON users (couple_id);

CREATE TABLE messages (
  id         BIGSERIAL PRIMARY KEY,
  couple_id  INT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL CHECK (length(body) <= 2000),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX messages_couple_time_idx ON messages (couple_id, created_at DESC);

CREATE TABLE love_notes (
  id         SERIAL PRIMARY KEY,
  couple_id  INT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  from_user  INT REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  open_on    DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX love_notes_couple_idx ON love_notes (couple_id, created_at DESC);

CREATE TABLE media (
  id         SERIAL PRIMARY KEY,
  couple_id  INT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT CHECK (kind IN ('photo','video')),
  url        TEXT NOT NULL,
  caption    TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX media_couple_idx ON media (couple_id, created_at DESC);

CREATE TABLE anniversaries (
  id        SERIAL PRIMARY KEY,
  couple_id INT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  on_date   DATE NOT NULL,
  repeats   BOOLEAN DEFAULT true
);
CREATE INDEX anniversaries_couple_idx ON anniversaries (couple_id, on_date);

CREATE TABLE subscriptions (
  id                 SERIAL PRIMARY KEY,
  couple_id          INT UNIQUE NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_sub_id      TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE payments (
  id               SERIAL PRIMARY KEY,
  couple_id        INT REFERENCES couples(id) ON DELETE SET NULL,
  stripe_invoice   TEXT UNIQUE,
  amount_cents     INT,
  currency         TEXT,
  paid_at          TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE contact_messages (
  id         SERIAL PRIMARY KEY,
  name       TEXT, email TEXT, message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
