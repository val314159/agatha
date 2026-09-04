import os, sys, logging
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
    >>> from memoriesdb.lib.logging_setup import setup_logger
    >>> setup_logger(__file__)
    >>> logger = logging.getLogger(__name__)
"""


MAX_LENGTH = 128
MAX_LENGTH = 60


class TruncateConsoleFilter(logging.Filter):
    """Truncates the message for the console but leaves the original intact."""
    def __init__(self, max_length=MAX_LENGTH):
        super().__init__()
        self.max_length = max_length

    def filter(self, record):
        # Resolve %-style formatting first so truncation doesn't break record.args.
        msg = record.getMessage()
        if len(msg) > self.max_length:
            record.msg = msg[:self.max_length] + "... [TRUNCATED]"
            record.args = ()
        return True


def setup_logging(log_file="agent.log", level=logging.DEBUG):
    # 1. GET LOGGER
    logger = logging.getLogger()
    logger.setLevel(level)
    if logger.hasHandlers():
        # be defensive yet informative
        raise Exception("Logger initialized twice!")

    # 2. FILE HANDLER (Saves EVERYTHING)
    file_handler = logging.FileHandler(log_file)
    file_formatter = logging.Formatter('%(asctime)s | %(levelname)-5s | %(name)s | %(message)s')
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

    # 3. CONSOLE HANDLER (Truncated for Honcho)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.addFilter(TruncateConsoleFilter())
    console_formatter = logging.Formatter('%(levelname)-5s | %(message)s')
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    return logger


def setup_logger(script_path, level=logging.DEBUG):
    # Extracts "an_agent" from "/path/to/an_agent.py"
    base_name = os.path.splitext(os.path.basename(script_path))[0]
    log_filename = f"{base_name}.log"

    return setup_logging(log_file=log_filename, level=level)
