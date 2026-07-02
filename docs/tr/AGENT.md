# Agent Kurulumu

Agent, Python 3.8+ stdlib ile yazılmış tek dosyadır. Sıfır pip bağımlılığı; her Linux'ta çalışır.

## Tek satır kurulum (önerilen)

İzlenecek sunucuda:

```bash
curl -fsSL https://raw.githubusercontent.com/ankasoft/vigil/main/agent/install.sh \
  | sudo bash -s -- \
      --key YOUR_API_KEY \
      --hub https://vigil.<your-account>.workers.dev
```

Bu şunları yapar:
1. `agent.py` ve `vigil-agent.service`'i indirir.
2. `/opt/vigil-agent/agent.py` olarak kurar (0755).
3. `/etc/vigil-agent.env` dosyasını **0600** perm ile yazar (API_KEY içinde olduğu için).
4. systemd unit'i kurar, enable + start yapar.

## Manuel kurulum

Sunucuda root olarak:

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

## Opsiyonlar

`install.sh` flag'leri:

| Flag | Default | Anlamı |
|---|---|---|
| `--key KEY` | (zorunlu) | Worker'a verdiğiniz `API_KEY` secret'ı |
| `--hub URL` | (zorunlu) | Worker base URL (sondaki `/` olmadan) |
| `--interval N` | `15` | Worker'a rapor gönderme aralığı (saniye) |
| `--sample N` | `3` | İçeride örnekleme aralığı (saniye). `INTERVAL`'a eşitlerseniz oversampling kapanır |
| `--uninstall` | — | Tüm dosyaları ve unit'i kaldırır |

## Doğrulama

```bash
sudo systemctl status vigil-agent
# active (running) görmelisiniz

sudo journalctl -u vigil-agent -f
# Çıktı boş = normal. Hata sadece HUB_URL/VIGIL_KEY eksikse görünür.
```

Dashboard'da host'un kart olarak göründüğünü kontrol edin (15-30 saniye içinde).

## Toplanan metrikler

| Metrik | Kaynak | Açıklama |
|---|---|---|
| `cpu` / `cpu_max` / `cpu_avg` | `/proc/stat` delta | Son rapor penceresinde anlık / peak / ortalama % |
| `ram` / `ram_max` / `ram_avg` | `/proc/meminfo` | `MemAvailable` bazlı |
| `ram_total_mb` | `/proc/meminfo` | Statik |
| `disk_root` | `os.statvfs("/")` | `/` mount yüzdesi |
| `disks[]` | `/proc/mounts` + `statvfs` | Tüm gerçek FS'ler (tmpfs/devtmpfs/overlay hariç) |
| `net_in` / `net_out` | `/proc/net/dev` | KB/s (lo hariç toplam) |
| `load1/5/15` | `/proc/loadavg` | Kernel smoothed |
| `uptime` | `/proc/uptime` | Saniye |
| `ip` | UDP socket trick | Outbound varsayılan arayüz IP'si |
| `os` | `/etc/os-release` `PRETTY_NAME` | — |
| `hostname` | `socket.gethostname()` | — |

## Düşük güçlü sunucular

Pi Zero W gibi cihazlarda bile ~0.05% CPU. Daha da düşürmek için:

```bash
# /etc/vigil-agent.env
INTERVAL=30
SAMPLE_INTERVAL=10
```

Veya oversampling'i tamamen kapatın:
```bash
INTERVAL=30
SAMPLE_INTERVAL=30   # cpu_max = cpu_avg = cpu (anlık)
```

## Toplu kurulum

```bash
for host in srv-01 srv-02 srv-03; do
  ssh $host "curl -fsSL https://raw.githubusercontent.com/ankasoft/vigil/main/agent/install.sh \
    | sudo bash -s -- --key $API_KEY --hub https://vigil.<your>.workers.dev"
done
```

## Kaldırma

```bash
sudo bash /opt/vigil-agent/install.sh --uninstall
# veya tek satır:
sudo systemctl disable --now vigil-agent
sudo rm -rf /opt/vigil-agent /etc/systemd/system/vigil-agent.service /etc/vigil-agent.env
sudo systemctl daemon-reload
```

## Hata ayıklama

| Belirti | Çözüm |
|---|---|
| `journalctl -u vigil-agent` boş, dashboard'da görünmüyor | Network: `curl -v https://vigil.<your>.workers.dev/api/servers` çalışıyor mu? |
| `vigil: HUB_URL and VIGIL_KEY env vars required` | `/etc/vigil-agent.env` eksik/yanlış |
| Host görünüyor ama "offline" | `STALE_SECONDS` worker var'ı çok düşük olabilir; veya agent yeni başlamış (ilk POST 1 INTERVAL gecikir) |
| Disk listesinde `/` görünmüyor | systemd `User=nobody` ile çalışıyor; bazı mount'ları okuyamıyor olabilir — root'a alın |
| CPU yüzdeleri hep 0 | İlk POST'tan önce delta yok; bir sonraki INTERVAL'da düzelir |
| Çok yüksek CPU (>1%) | Beklenmedik — issue açın; muhtemel sebep: çok sayıda mount + sık `statvfs` |
| Agent çalışıyor ama dashboard'da görünmüyor | Cloudflare'in Bot Fight Mode'u Python-urllib UA'sını engelliyor olabilir (error 1010). Agent zaten `User-Agent: vigil-agent/0.1` yolluyor; yine de sorun varsa `debug.py` ile test edin |
| `HTTPError status=403 body=error code: 1010` | Cloudflare bot fight engeli. Agent User-Agent'ini değiştirin veya CF panel → Security → Bot Fight Mode'u kapatın |
