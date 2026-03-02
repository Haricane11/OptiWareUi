"""add demand analytics and update reorder policy

Revision ID: a3f1d2e4b876
Revises: 071cd0620984
Create Date: 2026-02-28 13:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f1d2e4b876'
down_revision: Union[str, None] = '071cd0620984'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Create product_demand_analytics table ─────────────────────────
    op.create_table(
        'product_demand_analytics',
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), primary_key=True),
        sa.Column('average_daily_demand', sa.Numeric(12, 4), nullable=False, server_default='0'),
        sa.Column('demand_std_dev', sa.Numeric(12, 4), nullable=False, server_default='0'),
        sa.Column('window_days', sa.Integer(), nullable=False, server_default='90'),
        sa.Column('sample_size', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Add new columns to reorder_policy ─────────────────────────────
    # Configurable parameters
    op.add_column('reorder_policy', sa.Column(
        'demand_window_days', sa.Integer(), nullable=False, server_default='90',
    ))
    op.add_column('reorder_policy', sa.Column(
        'ordering_cost', sa.Numeric(10, 2), nullable=True,
    ))
    op.add_column('reorder_policy', sa.Column(
        'holding_cost', sa.Numeric(10, 2), nullable=True,
    ))
    op.add_column('reorder_policy', sa.Column(
        'service_level', sa.Numeric(5, 2), nullable=False, server_default='1.65',
    ))

    # Computed demand metrics
    op.add_column('reorder_policy', sa.Column(
        'average_daily_demand', sa.Numeric(12, 4), nullable=True,
    ))
    op.add_column('reorder_policy', sa.Column(
        'demand_std_dev', sa.Numeric(12, 4), nullable=True,
    ))
    op.add_column('reorder_policy', sa.Column(
        'last_computed_at', sa.DateTime(timezone=True), nullable=True,
    ))

    # Fields from DB diagram that may not exist yet
    op.add_column('reorder_policy', sa.Column(
        'reorder_frequency_days', sa.Integer(), nullable=True,
    ))
    op.add_column('reorder_policy', sa.Column(
        'lead_time_days', sa.Integer(), nullable=True,
    ))

    # ── Performance indexes ───────────────────────────────────────────
    op.create_index(
        'ix_delivery_notes_shipped_at',
        'delivery_notes',
        ['shipped_at'],
    )


def downgrade() -> None:
    # ── Drop indexes ──────────────────────────────────────────────────
    op.drop_index('ix_delivery_notes_shipped_at', table_name='delivery_notes')

    # ── Remove new columns from reorder_policy ────────────────────────
    op.drop_column('reorder_policy', 'lead_time_days')
    op.drop_column('reorder_policy', 'reorder_frequency_days')
    op.drop_column('reorder_policy', 'last_computed_at')
    op.drop_column('reorder_policy', 'demand_std_dev')
    op.drop_column('reorder_policy', 'average_daily_demand')
    op.drop_column('reorder_policy', 'service_level')
    op.drop_column('reorder_policy', 'holding_cost')
    op.drop_column('reorder_policy', 'ordering_cost')
    op.drop_column('reorder_policy', 'demand_window_days')

    # ── Drop product_demand_analytics table ───────────────────────────
    op.drop_table('product_demand_analytics')
