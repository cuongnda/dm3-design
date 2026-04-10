# Parking rollout verification checklist

This is the local confidence pass for the current parking slices, with emphasis on vehicle/session lifecycle and phase-2 pass + ANPR workflows.

## Automated regression

Run the focused parking handler suite:

```bash
cd backend
go test ./internal/access -run 'TestParking(VehicleSessionPaymentLifecycle|RecognitionPassFlow)$' -v
```

What it proves:
- vehicle registration persists normalized plates
- parking lot + zone creation works against the real schema
- fee rules are applied during exit calculation
- session exit moves to pending payment when payment is required
- payment collection settles the session
- phase-2 monthly pass issuance updates the linked vehicle
- ANPR entry/exit uses the pass-aware decision path and settles resident exits

## Local smoke pass

Prereqs:
- Timescale/Postgres available on `localhost:5433`
- auth-svc + access-svc running, or the console dev server proxy wired to them
- console available at `http://localhost:3000`

### 1. Vehicle registration
- Open `/operate/parking`
- Register a new vehicle with a unique Vietnamese plate
- Confirm it appears in the Vehicles table
- Open vehicle detail and confirm the normalized plate / metadata are present via API if needed

### 2. Manual entry and paid exit
- Create a lot + zone if the tenant has none
- Add a visitor vehicle
- Create a manual entry session
- Confirm the session appears in Active Sessions
- Exit the session
- Verify fee is shown and payment action is enabled
- Collect payment
- Confirm payment status becomes `paid` and the session disappears from active-only view

### 3. Resident pass + ANPR flow
- Issue an active parking pass to a resident vehicle
- Run ANPR entry with confidence > 0.85
- Confirm the session decision is `resident_pass_allow`
- Run ANPR exit for the same plate
- Confirm exit completes without operator payment intervention

### 4. Edge smoke checks
- Try a blacklisted vehicle plate, confirm entry is denied
- Try a plate mismatch on exit, confirm session becomes `disputed`
- Fill a 1-space zone, confirm the next entry is rejected with capacity conflict

## Current gap

There is still no dedicated end-to-end Playwright suite for `/operate/parking`. The backend regression coverage added here is high-signal and runs against the real schema, but UI automation for the parking page should be the next follow-up once the local access-svc/console parking route is consistently available in CI/dev.