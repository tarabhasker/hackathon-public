"""profile photos, stored in the database

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Small (client-resized) images live in the DB so they survive redeploys
    # without needing a file volume or object store.
    op.add_column("people", sa.Column("avatar", sa.LargeBinary))
    op.add_column("people", sa.Column("avatar_type", sa.Text))
    # Random key used in the public image URL; changes on every upload, so the
    # URL is unguessable and safe to cache forever.
    op.add_column("people", sa.Column("avatar_key", sa.Text, unique=True))


def downgrade() -> None:
    op.drop_column("people", "avatar_key")
    op.drop_column("people", "avatar_type")
    op.drop_column("people", "avatar")
