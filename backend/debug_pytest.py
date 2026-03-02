import pytest
import sys

with open("pytest_output.txt", "w", encoding="utf-8") as f:
    sys.stdout = f
    sys.stderr = f
    try:
        pytest.main(["tests/test_analytics_unittest.py", "-v", "--tb=long"])
    except Exception as e:
        print(f"Exception: {e}")
