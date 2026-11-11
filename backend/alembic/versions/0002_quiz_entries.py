"""replace items with quiz entries

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quiz_entries",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("age", sa.Integer, nullable=False),
        sa.Column("favourite_food", sa.Text, nullable=False),
        sa.Column("house", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.drop_table("items")


def downgrade() -> None:
    op.create_table(
        "items",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.drop_table("quiz_entries")
