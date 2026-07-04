"""AI Video Dubber backend package (FastAPI).

Wraps the existing, working business logic from the legacy PyQt app and the
standalone worker scripts. Per project rules, the legacy code is never modified
or rewritten; algorithms are ported verbatim and standalone workers are reused
as-is via subprocess.
"""
