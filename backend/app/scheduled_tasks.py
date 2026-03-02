"""
Scheduled task for periodic demand analysis recalculation.

Provides both:
  1. A standalone async runner (for cron / Windows Task Scheduler).
  2. A Celery-compatible task (for Celery Beat).

Usage:
  # Standalone cron (run via python):
  python -m app.scheduled_tasks

  # Celery Beat (add to celeryconfig schedule):
  CELERYBEAT_SCHEDULE = {
      "recalculate-demand": {
          "task": "app.scheduled_tasks.recalculate_demand_celery",
          "schedule": crontab(hour=2, minute=0),  # daily at 2 AM
      },
  }
"""

import asyncio
import logging

from app.core.database import async_session_factory
from app.services.demand_analysis_service import DemandAnalysisService

logger = logging.getLogger(__name__)


async def recalculate_demand_async() -> list[dict]:
    """
    Standalone async function for periodic demand recalculation.

    Creates its own DB session and transaction. Suitable for running
    from cron, Windows Task Scheduler, or any async entry point.
    """
    logger.info("Starting scheduled demand recalculation...")
    async with async_session_factory() as session:
        async with session.begin():
            results = await DemandAnalysisService.recalculate_all_policies(
                session,
            )

    computed = [r for r in results if r.get("status") == "computed"]
    errors = [r for r in results if r.get("status") == "error"]
    logger.info(
        "Demand recalculation complete: %d computed, %d errors, %d skipped",
        len(computed),
        len(errors),
        len(results) - len(computed) - len(errors),
    )
    return results


# ── Celery-compatible wrapper ─────────────────────────────────────

try:
    from celery import shared_task

    @shared_task(name="app.scheduled_tasks.recalculate_demand_celery")
    def recalculate_demand_celery() -> list[dict]:
        """
        Celery task wrapper for demand recalculation.

        Runs the async function inside a new event loop.
        Add to your Celery Beat schedule for periodic execution.
        """
        return asyncio.run(recalculate_demand_async())

except ImportError:
    # Celery not installed — standalone mode only
    pass


# ── Standalone entry point ────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    results = asyncio.run(recalculate_demand_async())
    for r in results:
        print(f"  Product {r['product_id']}: {r.get('status', 'unknown')}")
