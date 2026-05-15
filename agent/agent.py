#!/usr/bin/env python3
"""
Vigil agent — Linux server metrics collector.

Reports to HUB_URL/api/ingest every INTERVAL seconds (default 15s). Internally
oversamples CPU/RAM every SAMPLE_INTERVAL seconds (default 3s) and reports
current/max/avg per window so transient spikes are not missed.

stdlib only, no third-party deps. ~0.05% CPU on a Pi Zero W.

Environment:
    VIGIL_KEY         (required)   shared API key (X-API-Key header)
    HUB_URL           (required)   e.g. https://vigil.example.com
    INTERVAL          (optional)   report interval in seconds, default 15
    SAMPLE_INTERVAL   (optional)   internal sample interval, default 3
"""

import json
import os
import socket
import sys
import time
import urllib.request
from collections import deque

# --- Config ----------------------------------------------------------------

HUB_URL = os.environ.get("HUB_URL", "").rstrip("/")
API_KEY = os.environ.get("VIGIL_KEY", "")
INTERVAL = max(1, int(os.environ.get("INTERVAL", "15")))
SAMPLE_INTERVAL = max(1, int(os.environ.get("SAMPLE_INTERVAL", "3")))
if SAMPLE_INTERVAL > INTERVAL:
    SAMPLE_INTERVAL = INTERVAL
SAMPLES_PER_REPORT = max(1, INTERVAL // SAMPLE_INTERVAL)

# Pseudo-filesystems we never want in the disks list.
_DISK_SKIP_FS = {
    "tmpfs", "devtmpfs", "squashfs", "overlay", "proc", "sysfs", "cgroup",
    "cgroup2", "pstore", "debugfs", "tracefs", "mqueue", "hugetlbfs",
    "securityfs", "autofs", "devpts", "rpc_pipefs", "binfmt_misc", "fusectl",
    "configfs", "bpf", "ramfs", "nsfs", "selinuxfs",
}

# --- Readers ---------------------------------------------------------------

def read_cpu_total_idle():
    """Aggregate cpu jiffies — (total, idle). Idle includes iowait."""
    with open("/proc/stat", "rb") as f:
        line = f.readline()
    parts = line.split()
    nums = [int(x) for x in parts[1:]]
    idle = nums[3] + (nums[4] if len(nums) > 4 else 0)
    return sum(nums), idle


def read_meminfo():
    """Return (used_pct, total_mb)."""
    info = {}
    with open("/proc/meminfo", "rb") as f:
        for line in f:
            k, _, rest = line.partition(b":")
            v = rest.strip().split()
            if v:
                try:
                    info[k] = int(v[0])  # kB
                except ValueError:
                    pass
    total_kb = info.get(b"MemTotal", 0)
    avail_kb = info.get(b"MemAvailable", info.get(b"MemFree", 0))
    if total_kb == 0:
        return 0.0, 0
    used_pct = (1.0 - avail_kb / total_kb) * 100
    return used_pct, total_kb // 1024


def read_loadavg():
    with open("/proc/loadavg", "rb") as f:
        parts = f.read().split()
    return float(parts[0]), float(parts[1]), float(parts[2])


def read_uptime():
    with open("/proc/uptime", "rb") as f:
        return int(float(f.read().split()[0]))


def read_disks():
    """All real filesystems via /proc/mounts + statvfs."""
    disks, seen = [], set()
    try:
        with open("/proc/mounts", "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                parts = line.split()
                if len(parts) < 3:
                    continue
                _dev, mount, fstype = parts[0], parts[1], parts[2]
                if fstype in _DISK_SKIP_FS or mount in seen:
                    continue
                if mount.startswith("/snap") or mount.startswith("/var/lib/docker/"):
                    continue
                try:
                    st = os.statvfs(mount)
                except OSError:
                    continue
                total = st.f_blocks * st.f_frsize
                if total == 0:
                    continue
                used = total - st.f_bavail * st.f_frsize
                seen.add(mount)
                disks.append({
                    "mount": mount,
                    "pct": round(used / total * 100, 1),
                    "used_gb": round(used / 1024**3, 2),
                    "total_gb": round(total / 1024**3, 2),
                })
    except OSError:
        pass
    return disks


_net_prev = None  # (monotonic_seconds, bytes_in, bytes_out)


def read_net_delta():
    """KB/s in and out since the previous call (lo excluded). First call: 0,0."""
    global _net_prev
    total_in = total_out = 0
    try:
        with open("/proc/net/dev", "rb") as f:
            f.readline(); f.readline()  # skip 2 header lines
            for line in f:
                name, _, rest = line.partition(b":")
                name = name.strip()
                if not name or name == b"lo":
                    continue
                fields = rest.split()
                if len(fields) < 16:
                    continue
                total_in += int(fields[0])
                total_out += int(fields[8])
    except OSError:
        return 0.0, 0.0
    now = time.monotonic()
    if _net_prev is None:
        _net_prev = (now, total_in, total_out)
        return 0.0, 0.0
    pt, pi, po = _net_prev
    dt = now - pt
    _net_prev = (now, total_in, total_out)
    if dt <= 0:
        return 0.0, 0.0
    return (round(max(0, total_in - pi) / dt / 1024, 1),
            round(max(0, total_out - po) / dt / 1024, 1))


# --- One-shot at startup --------------------------------------------------

def detect_ip():
    """Outbound-default IP — does NOT send packets, just queries the kernel."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("1.1.1.1", 80))
        return s.getsockname()[0]
    except OSError:
        return ""
    finally:
        s.close()


def detect_os():
    try:
        with open("/etc/os-release", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return ""


# --- POST -----------------------------------------------------------------

def post(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        HUB_URL + "/api/ingest",
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp.read()
    except Exception:
        # Silent: agent must never crash on network blips. No retry; the next
        # tick produces a fresh report.
        pass


# --- Main loop ------------------------------------------------------------

def main():
    if not HUB_URL or not API_KEY:
        sys.stderr.write("vigil: HUB_URL and VIGIL_KEY env vars required\n")
        sys.exit(2)

    hostname = socket.gethostname()
    ip = detect_ip()
    os_name = detect_os()

    cpu_samples = deque(maxlen=SAMPLES_PER_REPORT)
    ram_samples = deque(maxlen=SAMPLES_PER_REPORT)
    prev_cpu = None
    tick = 0
    ram_total_mb = 0

    while True:
        t0 = time.monotonic()

        total, idle = read_cpu_total_idle()
        if prev_cpu is not None:
            dt_total = total - prev_cpu[0]
            dt_idle = idle - prev_cpu[1]
            if dt_total > 0:
                cpu_samples.append(round(max(0.0, (1 - dt_idle / dt_total) * 100), 1))
        prev_cpu = (total, idle)

        ram_pct, ram_total_now = read_meminfo()
        if ram_total_now:
            ram_total_mb = ram_total_now
        ram_samples.append(round(ram_pct, 1))

        tick += 1

        if tick >= SAMPLES_PER_REPORT and cpu_samples:
            tick = 0
            cpu_cur = cpu_samples[-1]
            cpu_max = max(cpu_samples)
            cpu_avg = round(sum(cpu_samples) / len(cpu_samples), 1)
            ram_cur = ram_samples[-1]
            ram_max = max(ram_samples)
            ram_avg = round(sum(ram_samples) / len(ram_samples), 1)

            disks = read_disks()
            disk_root = next((d["pct"] for d in disks if d["mount"] == "/"), 0.0)
            net_in, net_out = read_net_delta()
            load1, load5, load15 = read_loadavg()

            post({
                "host": hostname,
                "ip": ip,
                "os": os_name,
                "ts": int(time.time() * 1000),
                "cpu": cpu_cur,
                "cpu_max": cpu_max,
                "cpu_avg": cpu_avg,
                "ram": ram_cur,
                "ram_max": ram_max,
                "ram_avg": ram_avg,
                "ram_total_mb": ram_total_mb,
                "disk_root": disk_root,
                "disks": disks,
                "net_in": net_in,
                "net_out": net_out,
                "load1": load1,
                "load5": load5,
                "load15": load15,
                "uptime": read_uptime(),
            })

        elapsed = time.monotonic() - t0
        time.sleep(max(0.0, SAMPLE_INTERVAL - elapsed))


if __name__ == "__main__":
    main()
