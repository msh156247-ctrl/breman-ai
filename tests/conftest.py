from __future__ import annotations

import os
from pathlib import Path
import shutil
import tempfile
import uuid


TEST_RUNTIME_DIR = Path(tempfile.gettempdir()) / f"bremen-pytest-{os.getpid()}-{uuid.uuid4().hex[:8]}"
TEST_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

os.environ["BREMEN_RUNTIME_DIR"] = str(TEST_RUNTIME_DIR)
os.environ["BREMEN_DB_PATH"] = str(TEST_RUNTIME_DIR / "bremen.db")
os.environ.setdefault("BREMEN_KEY_ENCRYPTION_SECRET", "bremen-pytest-encryption-secret")


def pytest_sessionfinish() -> None:
    shutil.rmtree(TEST_RUNTIME_DIR, ignore_errors=True)
