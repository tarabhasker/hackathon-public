"""coffee chats people schedule with their connections

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coffee_chats",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("inviter_id", sa.Integer, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invitee_id", sa.Integer, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("starts_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer, nullable=False, server_default="30"),
        sa.Column("location", sa.Text),
        sa.Column("event_name", sa.Text),  # where they met, if the invite came from an event
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_coffee_chats_inviter", "coffee_chats", ["inviter_id"])
    op.create_index("ix_coffee_chats_invitee", "coffee_chats", ["invitee_id"])


def downgrade() -> None:
    op.drop_table("coffee_chats")
