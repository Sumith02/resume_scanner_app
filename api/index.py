from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.db import init_db
from backend.main import app

# Ensure database tables and demo seed exist when running serverless
try:
    init_db()
    from scripts.seed import seed

    seed()
except Exception as e:
    print(f"[Nexerra Vercel API] Initialization note: {e}")
