# Agent Setup

The agent is a single file written with the Python 3.8+ stdlib. Zero pip dependencies; it runs on any Linux.

## One-line install (recommended)

On the server to be monitored:

```bash
curl -fsSL https://raw.githubusercontent.com/ankasoft/vigil/main/agent/install.sh \
  | sudo bash -s -- \
      --key YOUR_API_KEY \
      --hub https://vigil.<your-account>.workers.dev
```

This does the following:
1. Downloads `agent.py` and `vigil-agent.service`.
2. Installs it as `/opt/vigil-agent/agent.py` (0755).
3. Writes the `/etc/vigil-agent.env` file with **0600** perms (since it contains the API_KEY).
4. Installs the systemd unit, then enables + starts it.

## Manual install

As root on the server:

```bash
sudo mkdir -p /opt/vigil-agent
sudo curl -fsSL -o /opt/vigil-agent/agent.py \
  https://raw.githubusercontent.com/ankasoft/vigil/main/agent/agent.py
sudo chmod 755 /opt/vigil-agent/agent.py

sudo curl -fsSL -o /etc/systemd/system/vigil-agent.service \
  https://raw.githubusercontent.com/ankasoft/vigil/main/agent/vigil-agent.service

sudo tee /etc/vigil-agent.env >/dev/null <<EOF
VIGIL_KEY=YOUR_API_KEY
HUB_URL=https://vigil.<your-account>.workers.dev
INTERVAL=15
SAMPLE_INTERVAL=3
EOF
sudo chmod 600 /etc/vigil-agent.env

sudo systemctl daemon-reload
sudo systemctl enable --now vigil-agent
```

## Options

`install.sh` flags:

| Flag | Default | Meaning |
|---|---|---|
| `--key KEY` | (required) | The `API_KEY` secret you gave the Worker |
| `--hub URL` | (required) | Worker base URL (without a trailing `/`) |
| `--interval N` | `15` | Reporting interval to the Worker (seconds) |
| `--sample N` | `3` | Internal sampling interval (seconds). If you set it equal to `INTERVAL`, oversampling is disabled |
| `--uninstall` | — | Removes all files and the unit |

## Verification

```bash
sudo systemctl status vigil-agent
# you should see active (running)

sudo journalctl -u vigil-agent -f
# Empty output = normal. Errors only appear if HUB_URL/VIGIL_KEY are missing.
```

Check that the host appears as a card on the dashboard (within 15-30 seconds).

## Collected metrics

| Metric | Source | Description |
|---|---|---|
| `cpu` / `cpu_max` / `cpu_avg` | `/proc/stat` delta | Instant / peak / average % over the last reporting window |
| `ram` / `ram_max` / `ram_avg` | `/proc/meminfo` | Based on `MemAvailable` |
| `ram_total_mb` | `/proc/meminfo` | Static |
| `disk_root` | `os.statvfs("/")` | `/` mount percentage |
| `disks[]` | `/proc/mounts` + `statvfs` | All real FSes (excluding tmpfs/devtmpfs/overlay) |
| `net_in` / `net_out` | `/proc/net/dev` | KB/s (total excluding lo) |
| `load1/5/15` | `/proc/loadavg` | Kernel smoothed |
| `uptime` | `/proc/uptime` | Seconds |
| `ip` | UDP socket trick | Outbound default interface IP |
| `os` | `/etc/os-release` `PRETTY_NAME` | — |
| `hostname` | `socket.gethostname()` | — |

## Low-power servers

Even on devices like the Pi Zero W, ~0.05% CPU. To lower it further:

```bash
# /etc/vigil-agent.env
INTERVAL=30
SAMPLE_INTERVAL=10
```

Or disable oversampling entirely:
```bash
INTERVAL=30
SAMPLE_INTERVAL=30   # cpu_max = cpu_avg = cpu (instant)
```

## Bulk install

```bash
for host in srv-01 srv-02 srv-03; do
  ssh $host "curl -fsSL https://raw.githubusercontent.com/ankasoft/vigil/main/agent/install.sh \
    | sudo bash -s -- --key $API_KEY --hub https://vigil.<your>.workers.dev"
done
```

## Uninstall

```bash
sudo bash /opt/vigil-agent/install.sh --uninstall
# or as a one-liner:
sudo systemctl disable --now vigil-agent
sudo rm -rf /opt/vigil-agent /etc/systemd/system/vigil-agent.service /etc/vigil-agent.env
sudo systemctl daemon-reload
```

## Troubleshooting

| Symptom | Solution |
|---|---|
| `journalctl -u vigil-agent` is empty, not showing on dashboard | Network: does `curl -v https://vigil.<your>.workers.dev/api/servers` work? |
| `vigil: HUB_URL and VIGIL_KEY env vars required` | `/etc/vigil-agent.env` is missing/wrong |
| Host appears but is "offline" | The `STALE_SECONDS` worker var may be too low; or the agent just started (the first POST is delayed by 1 INTERVAL) |
| `/` not appearing in the disk list | systemd is running as `User=nobody`; it may be unable to read some mounts — switch to root |
| CPU percentages are always 0 | No delta before the first POST; it corrects itself on the next INTERVAL |
| Very high CPU (>1%) | Unexpected — open an issue; the likely cause: many mounts + frequent `statvfs` |
| Agent is running but not showing on dashboard | Cloudflare's Bot Fight Mode may be blocking the Python-urllib UA (error 1010). The agent already sends `User-Agent: vigil-agent/0.1`; if the problem persists, test with `debug.py` |
| `HTTPError status=403 body=error code: 1010` | Cloudflare bot fight block. Change the agent's User-Agent or disable CF panel → Security → Bot Fight Mode |
