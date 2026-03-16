# Proxmox Server Hardening Guide

## Architecture Overview

```
Physical Host (Proxmox)
├── vmbr0 — VLAN 10 (Management)
│   └── Proxmox web UI (8006), SSH (2222)
│   └── Accessible from trusted workstation only
│
└── vmbr1 — VLAN 20 (Services)
    └── LXC: Docker host
        ├── web (Next.js, port 3000) → Cloudflare tunnel
        ├── scraper (Node.js cron)
        ├── db (PostgreSQL, internal only)
        └── cloudflared (tunnel daemon)

Future:
└── vmbr2 — VLAN 30 (Monitoring)  [when monitoring stack is added]
    └── LXC or VM: Prometheus + Grafana + Pushgateway
```

---

## Phase 1 — Proxmox Host Hardening

### 1.1 SSH Hardening

Edit `/etc/ssh/sshd_config`:

```
Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers yourusername
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

Restart SSH:
```bash
systemctl restart sshd
```

Copy your public key to the server before disabling password auth:
```bash
ssh-copy-id -p 2222 yourusername@proxmox-ip
```

### 1.2 Install fail2ban (on Proxmox host OS)

```bash
apt install fail2ban -y

# Create local override (survives package updates)
cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = 2222
maxretry = 5
bantime = 3600
findtime = 600
EOF

systemctl enable fail2ban
systemctl start fail2ban
```

Verify it's running:
```bash
fail2ban-client status sshd
```

### 1.3 Host Firewall (UFW)

```bash
apt install ufw -y

ufw default deny incoming
ufw default allow outgoing

# SSH on custom port
ufw allow 2222/tcp

# Proxmox web UI — LAN only (replace with your LAN subnet)
ufw allow from 192.168.1.0/24 to any port 8006

# Docker internal networks
ufw allow from 172.16.0.0/12

ufw enable
ufw status verbose
```

### 1.4 Proxmox Web UI

- **Never expose port 8006 publicly** — LAN access only enforced by UFW above
- Restrict to a specific workstation IP for extra security:
  ```bash
  ufw delete allow from 192.168.1.0/24 to any port 8006
  ufw allow from 192.168.1.50 to any port 8006   # your workstation IP
  ```
- Enable Proxmox 2FA: Datacenter → Users → your user → Two-Factor

### 1.5 Keep Host Updated

```bash
apt update && apt dist-upgrade -y
# Set up unattended security updates
apt install unattended-upgrades -y
dpkg-reconfigure unattended-upgrades
```

---

## Phase 2 — Network Separation (VLANs)

### 2.1 Create vmbr1 for Services

Add to `/etc/network/interfaces` on the Proxmox host:

```
auto vmbr1
iface vmbr1 inet static
    address 10.10.20.1/24
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    # Internal bridge — no physical port, routes via Proxmox
```

Apply without rebooting:
```bash
ifreload -a
```

### 2.2 Move Docker LXC to vmbr1

In Proxmox UI:
1. Shut down the LXC
2. LXC → Network → Edit `eth0`
3. Change Bridge from `vmbr0` to `vmbr1`
4. Set IP to `10.10.20.10/24`, gateway `10.10.20.1`
5. Start LXC

Verify Proxmox management (8006) is unreachable from inside LXC:
```bash
# Inside LXC — this should fail
curl -k https://10.10.20.1:8006
```

### 2.3 Enable IP Forwarding for Outbound Internet (LXC → Internet)

On Proxmox host, add to `/etc/sysctl.conf`:
```
net.ipv4.ip_forward=1
```

Add NAT rule for the services subnet:
```bash
# Add to /etc/network/interfaces under vmbr1 definition:
    post-up echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up iptables -t nat -A POSTROUTING -s 10.10.20.0/24 -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s 10.10.20.0/24 -o vmbr0 -j MASQUERADE
```

---

## Phase 3 — LXC Hardening

### 3.1 Check LXC Privilege Level

In `/etc/pve/lxc/<id>.conf`:

```ini
# Preferred (unprivileged):
unprivileged: 1
features: nesting=1,keyctl=1

# Avoid if possible (privileged = higher kernel escape risk):
unprivileged: 0
```

To convert an existing privileged LXC to unprivileged:
- Back up first: `vzdump <id>`
- This requires uid/gid remapping — test in a non-production clone first

### 3.2 LXC Resource Limits

In `/etc/pve/lxc/<id>.conf`, add limits to prevent resource exhaustion:
```ini
cores: 2
memory: 2048
swap: 512
```

### 3.3 SSH into LXC

If you SSH directly into the LXC (not just via `pct enter`), apply the same SSH hardening as the host inside the LXC.

---

## Phase 4 — Docker Security Inside LXC

### 4.1 Never Expose PostgreSQL

`docker-compose.prod.yml` already has no `ports:` on the `db` service. Keep it that way. DB is only reachable by other containers on the Docker internal network.

### 4.2 Run Containers as Non-Root

Add to `Dockerfile.scraper` and `Dockerfile.web`:
```dockerfile
RUN addgroup -S app && adduser -S app -G app
USER app
```

### 4.3 Read-Only Filesystems Where Possible

In `docker-compose.prod.yml`, add to containers that don't need to write to their filesystem:
```yaml
read_only: true
tmpfs:
  - /tmp
```

### 4.4 Docker Daemon Hardening

Create `/etc/docker/daemon.json` inside the LXC:
```json
{
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Restart Docker: `systemctl restart docker`

---

## Phase 5 — Cloudflare Zero Trust

### 5.1 Web App (already configured)

Cloudflare tunnel → web container port 3000. No inbound ports open.

### 5.2 Pushgateway (for monitoring / future AWS)

When the monitoring stack is added, expose Pushgateway via Zero Trust service token:

1. Cloudflare Zero Trust → Access → Applications → Add Application
2. Type: Self-hosted, URL: `pushgateway.yourdomain.com`
3. Policy: Service Auth → create a Service Token
4. Note the `CF-Access-Client-Id` and `CF-Access-Client-Secret`
5. Store as secrets in AWS ECS task definition when migrating

AWS ECS scraper includes headers on all Pushgateway pushes:
```
CF-Access-Client-Id: <token-id>
CF-Access-Client-Secret: <token-secret>
```

### 5.3 Grafana (when monitoring stack added)

1. Cloudflare Zero Trust → Access → Applications → Add Application
2. Type: Self-hosted, URL: `grafana.yourdomain.com`
3. Policy: Emails → add allowed email addresses
4. No Grafana credentials exposed to internet — Cloudflare handles auth

---

## Phase 6 — Monitoring LXC (future)

When the Prometheus + Grafana + Pushgateway stack is added, isolate it on its own LXC:

```
New LXC: monitoring
├── vmbr2 — VLAN 30 (10.10.30.0/24)
├── Prometheus (port 9090, LAN only)
├── Grafana (port 3001, via Cloudflare Zero Trust)
└── Pushgateway (port 9091, via Cloudflare Zero Trust service token)
```

Keep it separate from the Docker app LXC so a compromised app container cannot reach monitoring infrastructure.

---

## Actionable Checklist

### Immediate (do now)
- [ ] Disable SSH password auth, add public key
- [ ] Change SSH port to 2222
- [ ] Install and configure fail2ban on Proxmox host
- [ ] Install UFW, deny all inbound except SSH + LAN for Proxmox UI
- [ ] Enable Proxmox 2FA
- [ ] Enable unattended security updates

### Short term (this week)
- [ ] Create `vmbr1` (10.10.20.0/24) in Proxmox network config
- [ ] Move Docker LXC to `vmbr1`
- [ ] Configure NAT so LXC can reach internet
- [ ] Verify Proxmox UI (8006) unreachable from LXC
- [ ] Add Docker log rotation (`daemon.json`)
- [ ] Check LXC is unprivileged (or plan migration to unprivileged)

### Medium term (before public launch)
- [ ] Add monitoring LXC on `vmbr2`
- [ ] Deploy Prometheus + Grafana + Pushgateway
- [ ] Set up Cloudflare Zero Trust for Grafana (email auth)
- [ ] Set up Cloudflare Zero Trust service token for Pushgateway
- [ ] Add `pino` structured logging + `prom-client` metrics to scraper
- [ ] Run containers as non-root (update Dockerfiles)

### Before AWS migration
- [ ] Document Cloudflare tunnel + Zero Trust config
- [ ] Confirm Pushgateway accessible from external (test from a non-LAN IP)
- [ ] Store Cloudflare service token in AWS Secrets Manager

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Public access method | Cloudflare tunnel | No open inbound ports, free TLS, DDoS protection |
| Auth for internal tools | Cloudflare Zero Trust | No credentials exposed, supports service tokens for ECS |
| Monitoring reach (AWS) | Pushgateway via Zero Trust | ECS pushes out, no VPN needed |
| Network isolation | VLANs via Proxmox bridges | Clean separation, Docker LXC can't reach Proxmox UI |
| fail2ban placement | Proxmox host OS | Needs iptables access, containers can't provide this |
| LXC type | Unprivileged (target) | Reduces kernel escape risk vs privileged LXC |
