#!/usr/bin/env python3
"""
Vigil agent — manual test / debug.

Reads /etc/vigil-agent.env, sends ONE ingest POST, prints the result
with full error details. Run on the agent host:

    curl -fsSL https://raw.githubusercontent.com/ankasoft/vigil/main/agent/debug.py | sudo python3

The production agent silences all errors by design (no retry, no logs).
This script does the opposite — it surfaces them.
"""

import json
import sys
import time
import urllib.error
import urllib.request


def parse_env(path: str) -> dict:
    out = {}
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if "=" not in line or line.startswith("#"):
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def main():
    try:
        env = parse_env("/etc/vigil-agent.env")
    except OSError as e:
        print(f"ENV READ ERR: {e}", file=sys.stderr)
        sys.exit(1)

    hub = env.get("HUB_URL", "")
    key = env.get("VIGIL_KEY", "")
    print(f"hub: {hub!r}")
    masked = f"{key[:8]}...{key[-4:]} (len={len(key)})" if key else "(empty)"
    print(f"key: {masked}")

    if not hub or not key:
        print("HUB_URL or VIGIL_KEY missing in /etc/vigil-agent.env")
        sys.exit(2)

    payload = {
        "host": "debug-test",
        "ts": int(time.time() * 1000),
        "cpu": 1.0, "cpu_max": 1.0, "cpu_avg": 1.0,
        "ram": 1.0, "ram_max": 1.0, "ram_avg": 1.0,
        "disk_root": 1.0,
        "net_in": 0.0, "net_out": 0.0,
        "load1": 0.0, "load5": 0.0, "load15": 0.0,
        "uptime": 0,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        hub + "/api/ingest",
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-API-Key": key,
            # Cloudflare blocks default Python-urllib UA with error 1010.
            "User-Agent": "vigil-agent/0.1",
        },
    )

    print(f"POST {hub}/api/ingest ...")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8", errors="replace")
            print(f"OK  status={r.status}  body={body}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTPError  status={e.code}  body={body}")
    except urllib.error.URLError as e:
        print(f"URLError  reason={e.reason!r}")
    except TimeoutError as e:
        print(f"Timeout  {e}")
    except Exception as e:
        print(f"OtherError  {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
