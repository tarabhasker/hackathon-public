"""events hosted by admins, and who joined them

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        # short URL-safe token embedded in the QR code: /join/<code>
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("is_open", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("host_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "event_members",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.Integer, sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("joined_at", sa.TIMESTAMP, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("event_id", "user_id", name="uq_event_members_event_user"),
    )
    op.create_index("ix_event_members_event", "event_members", ["event_id"])


def downgrade() -> None:
    op.drop_table("event_members")
    op.drop_table("events")
