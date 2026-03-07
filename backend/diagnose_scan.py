import asyncio
import sys
import os

# Add the current directory to sys.path to allow absolute imports
sys.path.append(os.getcwd())

async def run_diagnostics():
    from app.core.database import async_session_factory
    from app.services.action_suggestion_engine import ActionSuggestionEngine
    import traceback

    print("--- Starting Health Scan Diagnostics ---")
    try:
        async with async_session_factory() as db:
            async with db.begin():
                print("Running ActionSuggestionEngine.run_full_scan...")
                result = await ActionSuggestionEngine.run_full_scan(db)
                print("Scan Success Summary:", result)
    except Exception as e:
        print("\n!!! ERROR DETECTED !!!")
        print(f"Exception Type: {type(e).__name__}")
        print(f"Exception Message: {str(e)}")
        print("\nFull Traceback:")
        traceback.print_exc()
        print("\n--- End of Traceback ---")

if __name__ == "__main__":
    asyncio.run(run_diagnostics())
