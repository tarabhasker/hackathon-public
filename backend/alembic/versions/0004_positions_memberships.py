"""structured work history for edge building

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "positions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("person_id", sa.Integer, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org", sa.Text, nullable=False),
        sa.Column("started_year", sa.Integer),
        sa.Column("ended_year", sa.Integer),
    )
    op.create_index("ix_positions_person", "positions", ["person_id"])

    op.create_table(
        "project_memberships",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("person_id", sa.Integer, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project", sa.Text, nullable=False),
        sa.Column("started_year", sa.Integer),
        sa.Column("ended_year", sa.Integer),
    )
    op.create_index("ix_memberships_person", "project_memberships", ["person_id"])


def downgrade() -> None:
    op.drop_table("project_memberships")
    op.drop_table("positions")
