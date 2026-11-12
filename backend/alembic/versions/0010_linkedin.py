"""LinkedIn profile link on people, used to send intro requests

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-12
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE people ADD COLUMN IF NOT EXISTS linkedin_url TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS linkedin_url")
