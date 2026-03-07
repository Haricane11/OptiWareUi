import asyncio
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.inventory_health import InventoryActionSuggestion, SuggestionType, SuggestionStatus
from app.services.action_suggestion_engine import ActionSuggestionEngine
from app.models.inventory import InventoryTransaction, Inventory

async def test_disposal():
    async with async_session_factory() as db:
        # Find a pending disposal suggestion
        stmt = select(InventoryActionSuggestion).where(
            InventoryActionSuggestion.suggestion_type == SuggestionType.DISPOSAL,
            InventoryActionSuggestion.status == SuggestionStatus.PENDING
        ).limit(1)
        suggestion = (await db.execute(stmt)).scalar_one_or_none()
        
        if not suggestion:
            print("No pending disposal suggestions found.")
            return

        print(f"Found DISPOSAL suggestion {suggestion.id} for Product {suggestion.product_id}")
        
        # 1. Approve it
        await ActionSuggestionEngine.approve_action(db, suggestion.id, approved_by=1)
        print(f"Approved suggestion {suggestion.id}")
        
        # 2. Execute it
        executed_sug = await ActionSuggestionEngine.execute_action(db, suggestion.id)
        print(f"Executed suggestion {executed_sug.id}, status: {executed_sug.status}")
        
        # 3. Verify InventoryTransaction
        trans_stmt = select(InventoryTransaction).where(InventoryTransaction.reference_action_id == suggestion.id)
        transaction = (await db.execute(trans_stmt)).scalar_one_or_none()
        if transaction:
            print(f"Verified: InventoryTransaction created: {transaction.quantity} qty written off.")
        else:
            print("Failed: No InventoryTransaction found!")
            
        # 4. Verify Inventory deduction
        inv_stmt = select(Inventory).where(
            Inventory.product_id == suggestion.product_id,
            Inventory.warehouse_id == suggestion.warehouse_id
        ).order_by(Inventory.created_at.desc()).limit(1)
        inv = (await db.execute(inv_stmt)).scalar_one_or_none()
        if inv:
            print(f"Verified: Inventory remaining qty: {inv.quantity}, available: {inv.available}, status: {inv.status}")
            
        await db.commit()
        print("Test complete and committed.")

if __name__ == "__main__":
    asyncio.run(test_disposal())
