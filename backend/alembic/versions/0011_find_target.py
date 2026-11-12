"""Find the Target (premium): user plans, external people, organisations, lookups

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-13
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' "
        "CHECK (plan IN ('free', 'premium'))"
    )

    op.execute(
        """
        CREATE TABLE organisations (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            name_key    TEXT NOT NULL UNIQUE,   -- lower(trim(name)), for matching
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # staff = our own people (synthetic or CV-uploaded); external = someone
    # found on the web by Find the Target, never shown in normal search
    op.execute(
        "ALTER TABLE people ADD COLUMN kind TEXT NOT NULL DEFAULT 'staff' "
        "CHECK (kind IN ('staff', 'external'))"
    )
    op.execute(
        "ALTER TABLE people ADD COLUMN org_id INT REFERENCES organisations(id) ON DELETE SET NULL"
    )
    op.execute("CREATE INDEX people_kind_idx ON people (kind)")

    op.execute(
        """
        CREATE TABLE external_profiles (
            person_id     INT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
            role_query    TEXT,
            schools       JSONB NOT NULL DEFAULT '[]',
            boards        JSONB NOT NULL DEFAULT '[]',
            sources       JSONB NOT NULL DEFAULT '[]',  -- [{url, title, found_at}]
            found_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            refreshed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # Every web lookup: the cache, the audit log and the coverage-gap record
    op.execute(
        """
        CREATE TABLE target_lookups (
            id                SERIAL PRIMARY KEY,
            user_id           INT REFERENCES users(id) ON DELETE SET NULL,
            company           TEXT NOT NULL,
            role              TEXT NOT NULL,
            query_key         TEXT NOT NULL,          -- lower(company)|lower(role)
            candidates        JSONB NOT NULL DEFAULT '[]',
            sources           JSONB NOT NULL DEFAULT '[]',
            chosen_person_id  INT REFERENCES people(id) ON DELETE SET NULL,
            report            JSONB,
            best_rung         INT,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX target_lookups_query_idx ON target_lookups (query_key, created_at DESC)")
    op.execute("CREATE INDEX target_lookups_user_idx ON target_lookups (user_id, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS target_lookups")
    op.execute("DROP TABLE IF EXISTS external_profiles")
    op.execute("DROP INDEX IF EXISTS people_kind_idx")
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS org_id")
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS kind")
    op.execute("DROP TABLE IF EXISTS organisations")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS plan")
