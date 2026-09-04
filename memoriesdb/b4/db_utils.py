"""Utility helpers for querying PostgreSQL and getting JSON-friendly dicts.

Features:
• Automatic json-safe conversion of UUID/bytes/memoryview
• Optional flattening of `_metadata` JSONB into top-level keys
"""
from __future__ import annotations

import base64
from typing import Any, Dict, Iterable

from fastapi.encoders import jsonable_encoder

from db_connect import db_cursor

__all__ = ["json_safe", "unflatten_row"]

# --- custom encoder ---------------------------------------------------
_CUSTOM_ENCODERS = {
    bytes: lambda b: base64.b64encode(b).decode(),
    memoryview: lambda mv: base64.b64encode(bytes(mv)).decode(),
}
# Optional encoders for vector types
try:
    import numpy as _np  # type: ignore
    _CUSTOM_ENCODERS[_np.ndarray] = lambda arr: arr.tolist()
except ImportError:  # pragma: no cover
    pass
# pgvector (>=0.4) reorganised its API; handle both layouts
_PGVectorType = None  # type: ignore
try:
    import pgvector.psycopg2.vector as _pgv_mod  # type: ignore
    # Prefer BinaryVector if present, else Vector
    _PGVectorType = getattr(_pgv_mod, "BinaryVector", None) or getattr(_pgv_mod, "Vector", None)
except ImportError:  # pragma: no cover
    pass
if _PGVectorType is None:
    # Older versions exposed Vector at package root
    try:
        from pgvector.psycopg2 import Vector as _PGVectorType  # type: ignore
    except ImportError:  # pragma: no cover
        _PGVectorType = None  # type: ignore
if _PGVectorType is not None:
    _CUSTOM_ENCODERS[_PGVectorType] = lambda v: v.to_list() if hasattr(v, "to_list") else list(v)

def json_safe(data: Any):
    """Return a JSON-serialisable version of *data* using FastAPI's encoder."""
    return jsonable_encoder(data, custom_encoder=_CUSTOM_ENCODERS)


def unflatten_row(d: Dict[str, Any], *, meta_fields: set[str] | None = None) -> Dict[str, Any]:
    """Given a *flattened* dict (metadata keys promoted), roll them back under `_metadata`.

    If *meta_fields* is provided, those keys are moved. Otherwise any key not in the
    canonical memory columns list is considered metadata.
    """
    canonical = {
        "id",
        "kind",
        "content",
        "created_by",
        "updated_by",
        "created_at",
        "updated_at",
        "deleted_at",
        # add other fixed columns here as needed
    }
    meta_fields = meta_fields or (set(d.keys()) - canonical)

    data: Dict[str, Any] = {}
    meta: Dict[str, Any] = {}
    for k, v in d.items():
        (meta if k in meta_fields else data)[k] = v

    if meta:
        data["_metadata"] = meta
    return data
