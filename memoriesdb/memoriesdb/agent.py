"""Public API for writing MemoriesDB hub agents.

Set ``NAME`` before starting an agent process. The agent listens on
``<NAME>-in`` and publishes to ``<NAME>-out``.
"""

import os

os.environ.setdefault("NAME", "agent")

from memoriesdb.lib.subagent import IN_CHANNEL, OUT_CHANNEL, SubAgentBase  # noqa: E402

__all__ = ["SubAgentBase", "IN_CHANNEL", "OUT_CHANNEL"]

