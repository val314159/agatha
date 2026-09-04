#!/usr/bin/env python3
"""Unit-test the json_safe() helper directly.

These tests run entirely in-memory — no database required — and ensure
our custom encoders handle all special types that may appear in query
results.
"""
from __future__ import annotations

import base64
import uuid

import pytest

from db_utils import json_safe

try:
    import numpy as np  # type: ignore
except ImportError:  # pragma: no cover
    np = None  # type: ignore

try:
    import pgvector.psycopg2.vector as _pgv
    PGVector = getattr(_pgv, "BinaryVector", None) or getattr(_pgv, "Vector", None)
except ImportError:  # pragma: no cover
    PGVector = None  # type: ignore


def test_bytes_and_memoryview():
    data = {
        "b": b"abc",
        "mv": memoryview(b"xyz"),
    }
    enc = json_safe(data)
    assert enc["b"] == base64.b64encode(b"abc").decode()
    assert enc["mv"] == base64.b64encode(b"xyz").decode()


def test_uuid():
    u = uuid.uuid4()
    assert json_safe(u) == str(u)


@pytest.mark.skipif(np is None, reason="numpy not installed")
def test_numpy_array():
    arr = np.array([1, 2, 3])
    assert json_safe(arr) == [1, 2, 3]


@pytest.mark.skipif(PGVector is None, reason="pgvector not installed")
def test_pgvector():
    vec = PGVector([0.1, 0.2, 0.3])  # type: ignore
    assert json_safe(vec) == pytest.approx([0.1, 0.2, 0.3], rel=1e-6)
