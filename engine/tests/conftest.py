import pytest
import os
import sys
import shutil
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))


@pytest.fixture
def tmp_workspace(tmp_path):
    lake = tmp_path / "data" / "lake"
    for strat in ("unpartitioned", "monthly", "daily"):
        (lake / strat).mkdir(parents=True)
    (tmp_path / "data" / "raw").mkdir(parents=True)
    (tmp_path / "data" / "quarantine").mkdir(parents=True)
    (tmp_path / "db").mkdir(parents=True)
    return tmp_path


@pytest.fixture
def patch_paths(tmp_workspace, monkeypatch):
    import engine.pipeline as pl
    import engine.db as db_mod
    import engine.compaction as comp

    monkeypatch.setattr(pl, "LAKE_ROOT", str(tmp_workspace / "data" / "lake"))
    monkeypatch.setattr(pl, "QUARANTINE_ROOT", str(tmp_workspace / "data" / "quarantine"))
    monkeypatch.setattr(db_mod, "DB_PATH", str(tmp_workspace / "db" / "wapfo.db"))
    monkeypatch.setattr(comp, "LAKE_ROOT", str(tmp_workspace / "data" / "lake"))
    return tmp_workspace
