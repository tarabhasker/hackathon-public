"""6 Degrees core tables: people, profiles, facets, edges, intros

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

# text-embedding-004 produces 768-dim vectors
EMBEDDING_DIM = 768


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "people",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("title", sa.Text),
        sa.Column("org_unit", sa.Text),
        sa.Column("email", sa.Text),
        sa.Column("ask_me_about", sa.Text),
        sa.Column("is_real", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("opt_in", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "profiles_raw",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "person_id",
            sa.Integer,
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.Text, nullable=False),  # cv | linkedin_pdf | connections_csv | synthetic
        sa.Column("raw_text", sa.Text, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "facets",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "person_id",
            sa.Integer,
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.Text, nullable=False),  # expertise | ask | offer
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.execute(f"ALTER TABLE facets ADD COLUMN embedding vector({EMBEDDING_DIM})")
    op.create_index("ix_facets_person_kind", "facets", ["person_id", "kind"])

    op.create_table(
        "edges",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("src", sa.Integer, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dst", sa.Integer, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.Text, nullable=False),  # declared | project | employer | school | semantic
        sa.Column("weight", sa.Float, nullable=False),  # 0..1
        sa.Column("started_at", sa.Date),
        sa.Column("ended_at", sa.Date),
        sa.Column("evidence", sa.Text),
        sa.UniqueConstraint("src", "dst", "type", name="uq_edges_src_dst_type"),
    )
    op.create_index("ix_edges_src", "edges", ["src"])
    op.create_index("ix_edges_dst", "edges", ["dst"])

    op.create_table(
        "intro_requests",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("requester_id", sa.Integer, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_id", sa.Integer, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("path", JSONB),
        sa.Column("status", sa.Text, nullable=False, server_default="draft"),
        sa.Column("drafts", JSONB),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("intro_requests")
    op.drop_table("edges")
    op.drop_table("facets")
    op.drop_table("profiles_raw")
    op.drop_table("people")
