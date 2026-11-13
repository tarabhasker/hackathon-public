"""Repair: make sure coffee_chats exists everywhere

The find-target and coffee-chats branches both claimed revision 0011. A
database that applied find-target first recorded 0011 without ever creating
coffee_chats, then skipped straight to 0012 after the renumbering. This
revision closes that gap; on databases that ran 0011 properly it's a no-op.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-13
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS coffee_chats (
            id               SERIAL PRIMARY KEY,
            inviter_id       INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
            invitee_id       INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
            starts_at        TIMESTAMPTZ NOT NULL,
            duration_minutes INT NOT NULL DEFAULT 30,
            location         TEXT,
            event_name       TEXT,
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_coffee_chats_inviter ON coffee_chats (inviter_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_coffee_chats_invitee ON coffee_chats (invitee_id)")


def downgrade() -> None:
    pass  # 0011 owns the real downgrade; this revision only repairs gaps
