"""profile photos, stored in the database

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-12

This migration originally shipped as a duplicate revision id "0006" (colliding
with the admin-flag migration), so databases out there recorded "0006" meaning
either one. It is therefore written to be idempotent, and it also back-fills
the admin flag for databases that applied the avatar columns under the old id
and skipped the admin-flag migration.
"""
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Small (client-resized) images live in the DB so they survive redeploys
    # without needing a file volume or object store.
    op.execute("ALTER TABLE people ADD COLUMN IF NOT EXISTS avatar BYTEA")
    op.execute("ALTER TABLE people ADD COLUMN IF NOT EXISTS avatar_type TEXT")
    # Random key used in the public image URL; changes on every upload, so the
    # URL is unguessable and safe to cache forever.
    op.execute("ALTER TABLE people ADD COLUMN IF NOT EXISTS avatar_key TEXT")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS people_avatar_key_key ON people (avatar_key)"
    )
    # Heal databases whose alembic_version said "0006" because of the old
    # duplicate id: they skipped 0006_admin_flag, so add the column here too.
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS avatar_key")
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS avatar_type")
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS avatar")
