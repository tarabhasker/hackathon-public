import os
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine

# Same resolution as main.py: env var first, local file as fallback
BASE_DIR = Path(__file__).resolve().parents[1]
DB_URL = f"sqlite:///{os.environ.get('DATABASE_PATH', BASE_DIR / 'app.db')}"

# No ORM models; migrations are written by hand
target_metadata = None


def run_migrations_offline() -> None:
    context.configure(url=DB_URL, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(DB_URL)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
