import asyncio
from app.core.database import SessionLocal
from app.services.action_suggestion_engine import ActionSuggestionEngine

async def main():
    try:
        async with SessionLocal() as db:
            await ActionSuggestionEngine.run_full_scan(db)
            print("Scan completed successfully!")
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())
