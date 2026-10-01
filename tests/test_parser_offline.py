"""KARST_OFFLINE must never let a grammar come from the network.

karst pins tree-sitter-language-pack 0.13.x, which bundles every grammar. 1.x
downloads grammars on first use; if it is installed anyway, offline mode has to
refuse rather than reach out. These tests swap in a fake language pack.
"""

from __future__ import annotations

import sys
import types

import pytest

from karst.languages import PYTHON
from karst.parser import GrammarUnavailable, ParserRegistry


def _fake_pack(monkeypatch: pytest.MonkeyPatch, *, downloaded: list[str] | None):
    calls: list[str] = []
    mod = types.ModuleType("tree_sitter_language_pack")
    mod.__version__ = "1.20.0" if downloaded is not None else "0.13.0"
    mod.get_parser = lambda name: calls.append(name) or object()
    if downloaded is not None:  # 1.x-style pack with a download cache
        mod.downloaded_languages = lambda: list(downloaded)
    monkeypatch.setitem(sys.modules, "tree_sitter_language_pack", mod)
    return calls


def test_offline_refuses_a_grammar_that_would_be_downloaded(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_pack(monkeypatch, downloaded=["go"])
    monkeypatch.setenv("KARST_OFFLINE", "1")

    with pytest.raises(GrammarUnavailable, match="would download the 'python' grammar"):
        ParserRegistry().get(PYTHON)
    assert calls == []


def test_offline_uses_an_already_cached_grammar(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_pack(monkeypatch, downloaded=["python"])
    monkeypatch.setenv("KARST_OFFLINE", "1")

    ParserRegistry().get(PYTHON)
    assert calls == ["python"]


def test_bundled_pack_needs_no_cache_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_pack(monkeypatch, downloaded=None)
    monkeypatch.setenv("KARST_OFFLINE", "1")

    ParserRegistry().get(PYTHON)
    assert calls == ["python"]


def test_online_mode_leaves_the_pack_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_pack(monkeypatch, downloaded=[])
    monkeypatch.delenv("KARST_OFFLINE", raising=False)

    ParserRegistry().get(PYTHON)
    assert calls == ["python"]
