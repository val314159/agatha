"""
Logging Configuration for Agentic Workflows under Honcho.

This module provides a robust logging setup designed to handle the 
limitations of process managers like Honcho. 

Key Features:
1.  Prevents BlockingIOError: Truncates long debug lines that exceed 
    OS pipe buffers (typically 64KB) to keep the Honcho manager stable.
2.  Dual-Routing:
    - Console (stdout): Info-level, truncated summaries for clean 
      terminal output.
    - File: Full Debug-level traces (untruncated) for deep forensics.
3.  Auto-Naming: Generates log filenames based on the entry-point script name.

Usage:
    In your main entry-point (e.g., an_agent.py):
    >>> from lib.logging_setup import setup_logger
    >>> setup_logger(__file__)
    >>> logger = logging.getLogger(__name__)
"""
import atexit
import os, sys, logging


MAX_LENGTH = int(os.getenv("LOG_MAX_LENGTH", 100))
_shutdown_registered = False


def _shutdown_logging_cleanly():
    logging.shutdown()
    # gevent's patched threading.get_ident can raise while greenlets are being
    # finalized. Drop logging's weakref callbacks before that late shutdown path.
    logging._handlerList.clear()


def _ensure_shutdown_registered():
    global _shutdown_registered
    if _shutdown_registered:
        return
    atexit.register(_shutdown_logging_cleanly)
    _shutdown_registered = True


class TruncateConsoleFilter(logging.Filter):
    """Truncates the message for the console but leaves the original intact."""
    def __init__(self, max_length=MAX_LENGTH):
        super().__init__()
        self.max_length = max_length

    def filter(self, record):
        # We modify a copy of the message for this handler only
        if len(record.msg) > self.max_length:
            record.msg = record.msg[:self.max_length] + "... [TRUNCATED]"
        return True


def setup_logging(log_file="agent.log", level=logging.DEBUG):
    _ensure_shutdown_registered()

    # 1. GET LOGGER
    logger = logging.getLogger()
    logger.setLevel(level)
    if logger.hasHandlers():
        # be defensive yet informative
        raise Exception("Logger initialized twice!")

    # 2. FILE HANDLER (Saves EVERYTHING)
    file_handler = logging.FileHandler(log_file)
    file_formatter = logging.Formatter('%(asctime)s | %(levelname)s | %(name)s | %(message)s')
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

    # 3. CONSOLE HANDLER (Truncated for Honcho)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.addFilter(TruncateConsoleFilter())
    console_formatter = logging.Formatter('%(levelname)s | %(message)s')
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    return logger


def setup_logger(script_path, level=logging.DEBUG):
    # Allow override via environment variable
    log_level_str = os.getenv("LOG_LEVEL", "").upper()
    if log_level_str:
        level = getattr(logging, log_level_str, level)
    
    # Extracts "an_agent" from "/path/to/an_agent.py"
    base_name = os.path.splitext(os.path.basename(script_path))[0]
    log_filename = f"{base_name}.log"

    return setup_logging(log_file=log_filename, level=level)
