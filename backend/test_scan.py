import asyncio
from app.core.database import async_session_factory
from app.services.action_suggestion_engine import ActionSuggestionEngine

async def run():
    async with async_session_factory() as db:
        try:
            res = await ActionSuggestionEngine.run_full_scan(db)
            print("SUCCESS:", res)
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run())
