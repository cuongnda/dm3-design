# Runbook — Migrate DM3 EC2 Instance Type

**Last reviewed:** 2026-04-13
**Applies to:** `dm3.demasterpro.com` production VM (single-instance deploy on AWS EC2)
**Estimated downtime:** ~5 minutes (Approach A, in-place change)
**Approver required:** project owner (per `CLAUDE.md` — never change prod infra without explicit permission)

This runbook covers changing the EC2 instance type without losing data or
changing the public IP. Tested path: `t2.xlarge → t3a.xlarge` (4 vCPU / 16 GB,
AMD, ~10% cheaper than t2 *and* 4.4× the sustained CPU baseline). Same procedure
works for any instance-family change supported by the current AMI.

---

## When to use

- Sustained CPU exceeds the t2 burstable baseline (CloudWatch `CPUCreditBalance`
  trending toward zero during normal load).
- Adding workloads that increase steady CPU/RAM (e.g., the monitoring stack from
  `docs/architecture/` plans).
- Right-sizing after observing actual usage for a few weeks.

## What does NOT change

Because we use an **Elastic IP** and keep the same EBS volumes:

- Public IP (Elastic IP stays attached)
- DNS (`dm3.demasterpro.com` keeps pointing to the same address)
- Private IP, VPC, subnet, security groups, IAM role, tags
- Instance ID
- All EBS volumes (root + any extras) — TimescaleDB data, MinIO clips,
  EMQX/NATS/Valkey state are all preserved
- All `.env` content, GitLab CI variables, SSH keys

## What DOES change

- vCPU type (Intel ↔ AMD when going to/from `t3a` / `m6a`) — negligible for
  Go and PostgreSQL workloads
- Hourly cost (check the price table in step 1)
- CPU baseline / burst behavior

---

## Pre-flight checklist (run the day before)

Run all of these from your laptop. They are read-only.

```bash
# Replace with the real instance id
export INSTANCE_ID=i-XXXXXXXXXXXXXXXXX
export AWS_REGION=ap-southeast-1   # adjust if different
```

### 1. Confirm Nitro-driver readiness on the running instance

t3a uses the Nitro hypervisor. Older AMIs may not have the ENA + NVMe drivers.

```bash
ssh -i /Users/dinhanhcuongnguyen/Documents/Duali/workspace.nosync/ssh/AWS \
    ubuntu@dm3.demasterpro.com \
    'modinfo ena | head -1 && modinfo nvme | head -1'
```

Both lines must resolve (not `ERROR: Module ... not found`). Modern Ubuntu
20.04+, Amazon Linux 2, and Debian 11+ ship them by default. If missing, on
Ubuntu install with:

```bash
sudo apt-get update && sudo apt-get install -y linux-modules-extra-$(uname -r)
sudo update-initramfs -u
```

### 2. Confirm ENA support flag is enabled on the instance

```bash
aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[].Instances[].EnaSupport' --output text
```

Expected: `True`. If `False`, fix it later (during the maintenance window, the
instance must be stopped first):

```bash
aws ec2 modify-instance-attribute --instance-id "$INSTANCE_ID" --ena-support
```

### 3. Confirm the Elastic IP is attached

```bash
aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[].Instances[].[PublicIpAddress,NetworkInterfaces[].Association.AllocationId]' \
  --output text
```

You should see your public IP and an `eipalloc-...` value. If `eipalloc` is
empty, the public IP **will change** at stop/start — allocate and attach an
Elastic IP first, or update DNS during the window.

### 4. Find every EBS volume attached (for the safety snapshots)

```bash
aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[].Instances[].BlockDeviceMappings[].[DeviceName,Ebs.VolumeId]' \
  --output table
```

### 5. Snapshot every attached volume (safety net)

Snapshots are async — kick them off the day before, or at the start of the
window. Cost is trivial; recovery time without one is hours.

```bash
for vol in $(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
              --query 'Reservations[].Instances[].BlockDeviceMappings[].Ebs.VolumeId' \
              --output text); do
  aws ec2 create-snapshot \
    --volume-id "$vol" \
    --description "pre-instance-type-migration $(date +%F)" \
    --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=dm3-migration-$(date +%F)}]"
done
```

### 6. Pause CI deploys

In GitLab → Settings → CI/CD → ensure no `deploy:production` job is queued.
Optionally tag the on-call channel.

### 7. Pick the target instance type

| Type | vCPU | RAM | $/hr (ap-southeast-1, on-demand) | Baseline CPU | Notes |
|---|---|---|---|---|---|
| t2.xlarge (current) | 4 | 16 GB | ~$0.1856 | 9% × 4 = 0.36 cores | Burstable, Xen |
| **t3a.xlarge** ⭐ | 4 | 16 GB | ~$0.1504 | 40% × 4 = 1.6 cores | Burstable, Nitro, AMD — **recommended** |
| t3.xlarge | 4 | 16 GB | ~$0.1664 | 1.6 cores | Burstable, Nitro, Intel |
| m6a.xlarge | 4 | 16 GB | ~$0.180 | full 4 cores (non-burst) | If burst behavior is unwanted at all |

> Prices are illustrative; check the AWS pricing page for your region before
> the change.

---

## Maintenance window — Approach A (in-place, ~5 min downtime)

This is the standard path. Same EBS, same IPs, same everything except the CPU.

```bash
# 0. Set vars on your laptop (re-export if shell restarted)
export INSTANCE_ID=i-XXXXXXXXXXXXXXXXX
export TARGET_TYPE=t3a.xlarge

# 1. Tell the team you're starting; announce the window in Slack/whatever channel

# 2. SSH in and stop the app cleanly so DB, NATS, EMQX flush properly
ssh -i /Users/dinhanhcuongnguyen/Documents/Duali/workspace.nosync/ssh/AWS \
    ubuntu@dm3.demasterpro.com
cd /path/to/dm3
docker compose -f docker-compose.prod.yml down
exit

# 3. Stop the instance
aws ec2 stop-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-stopped --instance-ids "$INSTANCE_ID"

# 4. Change instance type
aws ec2 modify-instance-attribute \
  --instance-id "$INSTANCE_ID" \
  --instance-type "{\"Value\": \"$TARGET_TYPE\"}"

# 5. Start the instance back up
aws ec2 start-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

# 6. Wait for status checks (2/2) before SSHing back in
aws ec2 wait instance-status-ok --instance-ids "$INSTANCE_ID"

# 7. SSH back in and bring the stack up
ssh -i /Users/dinhanhcuongnguyen/Documents/Duali/workspace.nosync/ssh/AWS \
    ubuntu@dm3.demasterpro.com
cd /path/to/dm3
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

**AWS Console alternative (same effect):**
> EC2 → Instances → select instance → **Instance state → Stop** → wait for
> `Stopped` → **Actions → Instance settings → Change instance type** →
> select target → **Apply** → **Instance state → Start**.

---

## Post-migration verification

Run these immediately after `compose up`. All must pass before declaring done.

```bash
# Still SSHed into the new instance:

# 1. Confirm new instance type
curl -s http://169.254.169.254/latest/meta-data/instance-type
# Expected: t3a.xlarge

# 2. All containers healthy
docker compose -f docker-compose.prod.yml ps
# Every dm3-* row should be 'Up' and (where defined) '(healthy)'

# 3. App health through nginx (TLS-terminated edge)
curl -fsS https://dm3.demasterpro.com/api/v1/healthz && echo OK

# 4. Per-service /healthz from inside dm3-internal network
for c in dm3-auth-svc dm3-identity-svc dm3-access-svc dm3-audit-svc \
         dm3-device-gateway dm3-visitor-svc dm3-parking-svc dm3-cctv-svc; do
  port=$(docker port "$c" 2>/dev/null | head -1 | awk -F: '{print $NF}')
  docker exec "$c" wget -qO- "http://localhost:${port}/healthz" \
    && echo "$c OK" || echo "$c FAIL"
done

# 5. TimescaleDB up and migrations at the expected head
docker exec dm3-timescaledb psql -U dm3 -d dm3 -c "SELECT version FROM schema_migrations;"
# Expected: 000014_parking_matched_by_expand (or whatever the current head is)

# 6. NATS + EMQX + MinIO + MediaMTX healthy
docker exec dm3-nats nats-server --version
docker exec dm3-emqx emqx ctl status
docker exec dm3-minio mc admin info local || true
curl -fsS http://localhost:9997/v3/paths/list | head -c 200   # MediaMTX API

# 7. Smoke test from a browser:
#    - Log into https://dm3.demasterpro.com
#    - List a tenant / users
#    - Open a CCTV live stream
#    - Trigger a test access event (or watch for one)
```

If anything in steps 2–6 fails, see **Rollback** below.

---

## Optional: switch to "unlimited" CPU credits for the first month

Costs nothing if you don't burst; auto-bills ~$0.05 per vCPU-hour of overage if
you do. Buys you time to observe whether the new baseline is actually enough.

```bash
aws ec2 modify-instance-credit-specification \
  --instance-credit-specification "InstanceId=$INSTANCE_ID,CpuCredits=unlimited"
```

After a month, review CloudWatch `CPUSurplusCreditsCharged`. If consistently
zero, switch back to `standard`:

```bash
aws ec2 modify-instance-credit-specification \
  --instance-credit-specification "InstanceId=$INSTANCE_ID,CpuCredits=standard"
```

---

## Rollback

EBS volumes are unchanged by an instance-type change, so rollback is just the
migration in reverse:

```bash
ssh -i .../AWS ubuntu@dm3.demasterpro.com \
    'cd /path/to/dm3 && docker compose -f docker-compose.prod.yml down'

aws ec2 stop-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-stopped --instance-ids "$INSTANCE_ID"

aws ec2 modify-instance-attribute \
  --instance-id "$INSTANCE_ID" \
  --instance-type '{"Value": "t2.xlarge"}'

aws ec2 start-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-status-ok --instance-ids "$INSTANCE_ID"

ssh -i .../AWS ubuntu@dm3.demasterpro.com \
    'cd /path/to/dm3 && docker compose -f docker-compose.prod.yml up -d'
```

If the EBS itself is somehow corrupted (rare — instance-type change does not
touch volume data), restore the most recent pre-migration snapshot:

```bash
# 1. Find the snapshot
aws ec2 describe-snapshots --owner-ids self \
  --filters "Name=tag:Name,Values=dm3-migration-$(date +%F)"

# 2. Create a new volume from it in the same AZ as the instance
aws ec2 create-volume --snapshot-id snap-XXXXXXXX \
  --availability-zone ap-southeast-1a --volume-type gp3

# 3. Stop instance, detach old root, attach restored volume as /dev/xvda, start
#    (See AWS docs: "Replace a root volume" — the simpler modern path is
#    `aws ec2 create-replace-root-volume-task --instance-id ... --snapshot-id ...`)
aws ec2 create-replace-root-volume-task \
  --instance-id "$INSTANCE_ID" \
  --snapshot-id snap-XXXXXXXX
```

---

## Approach B (blue/green via AMI) — when NOT to use

This was considered and rejected for DM3 because:

- DM3 is stateful and single-VM (TimescaleDB hypertables, MinIO clips, EMQX
  sessions, NATS JetStream state all live on local EBS volumes).
- Spinning up a new instance from an AMI captures stale state at snapshot
  time. To keep it consistent you'd still need to stop the old instance during
  the cutover — defeating the zero-downtime point.
- The 5-minute downtime in Approach A is acceptable inside a maintenance
  window.

If a future architecture moves stateful pieces (DB, object storage, message
broker) to managed AWS services (RDS, S3, MSK), revisit blue/green.

---

## Notes on credentials and secrets

This runbook touches **only the EC2 instance type**. It does not change:

- `.env` content (materialized from GitLab CI variables by
  `scripts/write-ci-env.sh` at deploy time)
- TLS certs in `certbot_webroot` volume
- Any database password, JWT secret, MinIO root password, or
  `CCTV_CREDENTIAL_KEY`

No secret rotation is required as part of this procedure.

---

## Change history

| Date | Change | Author |
|---|---|---|
| 2026-04-13 | Initial version. | Cuong + Claude |
