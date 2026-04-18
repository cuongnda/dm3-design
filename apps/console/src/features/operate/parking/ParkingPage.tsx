import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CarFront,
  CircleDot,
  CircleOff,
  CreditCard,
  Gauge,
  ListPlus,
  LogOut,
  Plus,
  Rows3,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import {
  AppModal,
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Label,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  showToast,
  type Column,
} from "@dm3/ui";
import type { ParkingSessionDTO, ParkingVehicleDTO } from "@dm3/api-client";
import { cn } from "@/lib/utils";
import {
  getSessionDurationMinutes,
  useCreateParkingEntry,
  useCreateParkingPass,
  useExitParkingSession,
  useParkingLots,
  useParkingPasses,
  useParkingSessions,
  useParkingVehicleDetail,
  useParkingVehicles,
  useParkingZones,
  useProcessParkingPayment,
  useRecognizeParkingPlate,
  useRegisterParkingVehicle,
} from "./useParking";

type VehicleFormState = {
  plate_number: string;
  type: string;
  category: string;
  registration_status: string;
  brand: string;
  color: string;
};

type EntryFormState = {
  lot_id: string;
  zone_id: string;
  plate_number: string;
  vehicle_type: string;
  entry_device_id: string;
  notes: string;
};

type ExitFormState = {
  plate_number: string;
  exit_device_id: string;
  notes: string;
};

type PassFormState = {
  vehicle_id: string;
  zone_id: string;
  valid_from: string;
  valid_until: string;
  fee_amount: string;
};

type RecognitionFormState = {
  lot_id: string;
  zone_id: string;
  direction: "entry" | "exit";
  plate_number: string;
  vehicle_type: string;
  device_id: string;
  confidence: string;
};

type PaymentFormState = {
  amount: string;
  method: string;
  reference: string;
};

const emptyVehicleForm: VehicleFormState = {
  plate_number: "",
  type: "motorbike",
  category: "resident",
  registration_status: "registered",
  brand: "",
  color: "",
};

const emptyEntryForm: EntryFormState = {
  lot_id: "",
  zone_id: "",
  plate_number: "",
  vehicle_type: "motorbike",
  entry_device_id: "",
  notes: "",
};

const emptyExitForm: ExitFormState = {
  plate_number: "",
  exit_device_id: "",
  notes: "",
};

const emptyPassForm: PassFormState = {
  vehicle_id: "",
  zone_id: "",
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10),
  fee_amount: "0",
};

const emptyRecognitionForm: RecognitionFormState = {
  lot_id: "",
  zone_id: "",
  direction: "entry",
  plate_number: "",
  vehicle_type: "motorbike",
  device_id: "",
  confidence: "0.92",
};

const emptyPaymentForm: PaymentFormState = {
  amount: "",
  method: "cash",
  reference: "",
};

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatMoney(value?: number) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function occupancyTone(percent: number) {
  if (percent >= 95)
    return "text-destructive border-destructive/30 bg-destructive/10";
  if (percent >= 85) return "text-warning border-warning/30 bg-warning/10";
  return "text-success border-success/30 bg-success/10";
}

export function ParkingPage() {
  const { t } = useTranslation("operate");
  const [lotFilter, setLotFilter] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [registerOpen, setRegisterOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [recognitionOpen, setRecognitionOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [paymentSession, setPaymentSession] =
    useState<ParkingSessionDTO | null>(null);
  const [exitSession, setExitSession] = useState<ParkingSessionDTO | null>(
    null,
  );
  const [vehicleForm, setVehicleForm] =
    useState<VehicleFormState>(emptyVehicleForm);
  const [entryForm, setEntryForm] = useState<EntryFormState>(emptyEntryForm);
  const [exitForm, setExitForm] = useState<ExitFormState>(emptyExitForm);
  const [passForm, setPassForm] = useState<PassFormState>(emptyPassForm);
  const [recognitionForm, setRecognitionForm] =
    useState<RecognitionFormState>(emptyRecognitionForm);
  const [paymentForm, setPaymentForm] =
    useState<PaymentFormState>(emptyPaymentForm);

  const lotsQuery = useParkingLots();
  const zonesQuery = useParkingZones(lotFilter || undefined);
  const vehiclesQuery = useParkingVehicles({
    page: 1,
    limit: 100,
    plate_number: vehicleSearch || undefined,
  });
  const activeSessionsQuery = useParkingSessions({
    page: 1,
    limit: 100,
    status: "active",
    plate_number: sessionSearch || undefined,
    lot_id: lotFilter || undefined,
  });
  const vehicleDetailQuery = useParkingVehicleDetail(
    selectedVehicleId || undefined,
  );
  const selectedVehicle = vehicleDetailQuery.data;
  const vehicleSessionsQuery = useParkingSessions(
    {
      page: 1,
      limit: 20,
      plate_number: selectedVehicle?.plate_number,
      lot_id: lotFilter || undefined,
    },
    60_000,
  );
  const passesQuery = useParkingPasses({
    page: 1,
    limit: 20,
    status: "active",
  });

  const registerVehicle = useRegisterParkingVehicle();
  const createEntry = useCreateParkingEntry();
  const createPass = useCreateParkingPass();
  const recognizePlate = useRecognizeParkingPlate();
  const processPayment = useProcessParkingPayment();
  const exitSessionMutation = useExitParkingSession();

  const lots = lotsQuery.data?.data ?? [];
  const zones = zonesQuery.data?.data ?? [];
  const vehicles = vehiclesQuery.data?.data ?? [];
  const activeSessions = activeSessionsQuery.data?.data ?? [];
  const activePasses = passesQuery.data?.data ?? [];
  const filteredZones = useMemo(
    () => zones.filter((zone) => !lotFilter || zone.lot_id === lotFilter),
    [zones, lotFilter],
  );
  const selectedZonesForEntry = useMemo(
    () =>
      zones.filter(
        (zone) => !entryForm.lot_id || zone.lot_id === entryForm.lot_id,
      ),
    [zones, entryForm.lot_id],
  );

  const totals = useMemo(() => {
    const totalSpaces = filteredZones.reduce(
      (sum, zone) => sum + zone.total_spaces,
      0,
    );
    const occupiedSpaces = filteredZones.reduce(
      (sum, zone) => sum + (zone.active_session_count ?? 0),
      0,
    );
    const availableSpaces = Math.max(0, totalSpaces - occupiedSpaces);
    const occupancyPercent =
      totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0;
    return { totalSpaces, occupiedSpaces, availableSpaces, occupancyPercent };
  }, [filteredZones]);

  const sessionsSummary = useMemo(() => {
    const disputed = activeSessions.filter(
      (session) => session.status === "disputed",
    ).length;
    const revenuePending = activeSessions.reduce(
      (sum, session) => sum + (session.fee_amount ?? 0),
      0,
    );
    return { disputed, revenuePending };
  }, [activeSessions]);

  const zoneMap = useMemo(
    () => new Map(filteredZones.map((zone) => [zone.id, zone])),
    [filteredZones],
  );
  const lotMap = useMemo(
    () => new Map(lots.map((lot) => [lot.id, lot])),
    [lots],
  );

  const vehicleColumns: Column<ParkingVehicleDTO>[] = [
    {
      key: "plate_number",
      header: t("parking.table.plate"),
      sortable: true,
      render: (vehicle) => (
        <span className="font-mono font-semibold text-foreground">
          {vehicle.plate_number}
        </span>
      ),
    },
    {
      key: "type",
      header: t("parking.table.type"),
      render: (vehicle) => (
        <Badge variant="secondary">
          {t(`parking.vehicleTypes.${vehicle.type}`)}
        </Badge>
      ),
    },
    {
      key: "category",
      header: t("parking.table.category"),
      render: (vehicle) => (
        <span>{t(`parking.categories.${vehicle.category}`)}</span>
      ),
    },
    {
      key: "brand",
      header: t("parking.table.brand"),
      render: (vehicle) => vehicle.brand || "—",
    },
    {
      key: "color",
      header: t("parking.table.color"),
      render: (vehicle) => vehicle.color || "—",
    },
    {
      key: "registration_status",
      header: t("parking.table.status"),
      render: (vehicle) => (
        <Badge>
          {t(`parking.registrationStatus.${vehicle.registration_status}`)}
        </Badge>
      ),
    },
  ];

  const sessionColumns: Column<ParkingSessionDTO>[] = [
    {
      key: "plate_number",
      header: t("parking.table.plate"),
      render: (session) => (
        <span className="font-mono font-semibold">{session.plate_number}</span>
      ),
    },
    {
      key: "vehicle_type",
      header: t("parking.table.type"),
      render: (session) => t(`parking.vehicleTypes.${session.vehicle_type}`),
    },
    {
      key: "zone_id",
      header: t("parking.table.zone"),
      render: (session) => {
        const zone = zoneMap.get(session.zone_id);
        return (
          <div>
            <div>{zone?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {lotMap.get(session.lot_id)?.name ?? "—"}
            </div>
          </div>
        );
      },
    },
    {
      key: "entry_time",
      header: t("parking.table.entryTime"),
      render: (session) => formatDateTime(session.entry_time),
    },
    {
      key: "duration",
      header: t("parking.table.duration"),
      render: (session) => formatMinutes(getSessionDurationMinutes(session)),
    },
    {
      key: "payment_status",
      header: t("parking.table.payment"),
      render: (session) => (
        <Badge variant="secondary">
          {session.payment_status
            ? t(`parking.paymentStatus.${session.payment_status}`)
            : "—"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("parking.table.action"),
      render: (session) => (
        <div className="flex flex-wrap gap-2">
          {(session.payment_status === "pending" ||
            ((session.fee_amount ?? 0) > 0 && !session.payment_status)) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openPaymentModal(session)}
              data-testid={`parking-button-pay-${session.id}`}
            >
              <CreditCard className="size-4" />
              Collect fee
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => openExitModal(session)}
            data-testid={`parking-button-exit-${session.id}`}
          >
            <LogOut className="size-4" />
            {t("parking.actions.manualExit")}
          </Button>
        </div>
      ),
    },
  ];

  const vehicleDetailSessions = vehicleSessionsQuery.data?.data ?? [];

  function resetEntryForm() {
    setEntryForm({ ...emptyEntryForm, lot_id: lotFilter || lots[0]?.id || "" });
  }

  function openEntryModal() {
    resetEntryForm();
    setEntryOpen(true);
  }

  function openExitModal(session: ParkingSessionDTO) {
    setExitSession(session);
    setExitForm({ ...emptyExitForm, plate_number: session.plate_number });
  }

  function openPaymentModal(session: ParkingSessionDTO) {
    setPaymentSession(session);
    setPaymentForm({
      ...emptyPaymentForm,
      amount: String(session.fee_amount ?? 0),
    });
  }

  async function handleRegisterVehicle() {
    if (!vehicleForm.plate_number.trim()) return;
    try {
      await registerVehicle.mutateAsync({
        plate_number: vehicleForm.plate_number.trim().toUpperCase(),
        type: vehicleForm.type,
        category: vehicleForm.category,
        registration_status: vehicleForm.registration_status,
        brand: vehicleForm.brand || undefined,
        color: vehicleForm.color || undefined,
      });
      showToast({
        type: "success",
        title: t("parking.toast.vehicleRegistered"),
      });
      setRegisterOpen(false);
      setVehicleForm(emptyVehicleForm);
    } catch (error) {
      showToast({
        type: "error",
        title: t("parking.toast.vehicleRegisterFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleCreateEntry() {
    if (
      !entryForm.lot_id ||
      !entryForm.zone_id ||
      !entryForm.plate_number.trim()
    )
      return;
    try {
      await createEntry.mutateAsync({
        lot_id: entryForm.lot_id,
        zone_id: entryForm.zone_id,
        plate_number: entryForm.plate_number.trim().toUpperCase(),
        vehicle_type: entryForm.vehicle_type,
        entry_device_id: entryForm.entry_device_id || undefined,
        metadata: entryForm.notes
          ? { operator_note: entryForm.notes }
          : undefined,
      });
      showToast({ type: "success", title: t("parking.toast.entryCreated") });
      setEntryOpen(false);
      resetEntryForm();
    } catch (error) {
      showToast({
        type: "error",
        title: t("parking.toast.entryCreateFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleExitSession() {
    if (!exitSession) return;
    try {
      await exitSessionMutation.mutateAsync({
        id: exitSession.id,
        data: {
          plate_number: exitForm.plate_number.trim() || undefined,
          exit_device_id: exitForm.exit_device_id || undefined,
          ...(exitForm.notes ? { plate_image_ref: exitForm.notes } : {}),
        },
      });
      showToast({ type: "success", title: t("parking.toast.exitCompleted") });
      setExitSession(null);
      setExitForm(emptyExitForm);
    } catch (error) {
      showToast({
        type: "error",
        title: t("parking.toast.exitFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleCreatePass() {
    if (!passForm.vehicle_id || !passForm.zone_id) return;
    try {
      await createPass.mutateAsync({
        vehicle_id: passForm.vehicle_id,
        zone_id: passForm.zone_id,
        valid_from: passForm.valid_from,
        valid_until: passForm.valid_until,
        fee_amount: Number(passForm.fee_amount || 0),
      });
      showToast({ type: "success", title: "Parking pass issued" });
      setPassOpen(false);
      setPassForm(emptyPassForm);
    } catch (error) {
      showToast({
        type: "error",
        title: "Failed to issue parking pass",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleRecognizePlate() {
    try {
      await recognizePlate.mutateAsync({
        lot_id: recognitionForm.lot_id,
        zone_id: recognitionForm.zone_id,
        direction: recognitionForm.direction,
        plate_number: recognitionForm.plate_number.trim().toUpperCase(),
        vehicle_type: recognitionForm.vehicle_type,
        device_id: recognitionForm.device_id || undefined,
        confidence: Number(recognitionForm.confidence || 0),
      });
      showToast({ type: "success", title: "ANPR decision processed" });
      setRecognitionOpen(false);
      setRecognitionForm({
        ...emptyRecognitionForm,
        lot_id: lotFilter || lots[0]?.id || "",
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Failed to process ANPR decision",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handlePayment() {
    if (!paymentSession) return;
    try {
      await processPayment.mutateAsync({
        id: paymentSession.id,
        data: {
          amount: Number(paymentForm.amount || 0),
          method: paymentForm.method,
          reference: paymentForm.reference || undefined,
        },
      });
      showToast({ type: "success", title: "Parking payment collected" });
      setPaymentSession(null);
      setPaymentForm(emptyPaymentForm);
    } catch (error) {
      showToast({
        type: "error",
        title: "Failed to collect payment",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("parking.title")}
        description={t("parking.phase1Description")}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRegisterOpen(true)}
            data-testid="parking-button-register-vehicle"
          >
            <Plus className="size-4" />
            {t("parking.actions.registerVehicle")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPassOpen(true)}
            data-testid="parking-button-create-pass"
          >
            <CreditCard className="size-4" />
            Issue pass
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRecognitionOpen(true)}
            data-testid="parking-button-recognize-plate"
          >
            <ScanLine className="size-4" />
            Simulate ANPR
          </Button>
          <Button
            size="sm"
            className="bg-operate hover:bg-operate/90 text-background"
            onClick={openEntryModal}
            data-testid="parking-button-manual-entry"
          >
            <ListPlus className="size-4" />
            {t("parking.actions.manualEntry")}
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-3">
        <Select
          value={lotFilter}
          onValueChange={setLotFilter}
          options={[
            { value: "", label: t("parking.filters.allLots") },
            ...lots.map((lot) => ({ value: lot.id, label: lot.name })),
          ]}
          placeholder={t("parking.filters.allLots")}
          data-testid="parking-select-lot-filter"
          className="w-[240px]"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("parking.stats.totalSpots")}
          value={String(totals.totalSpaces)}
          sub={t("parking.stats.zoneCount", { count: filteredZones.length })}
          icon="🅿️"
          domain="operate"
        />
        <StatCard
          label={t("parking.stats.occupied")}
          value={String(totals.occupiedSpaces)}
          sub={`${totals.occupancyPercent}% ${t("parking.stats.utilization")}`}
          icon="🚗"
          domain="operate"
        />
        <StatCard
          label={t("parking.stats.available")}
          value={String(totals.availableSpaces)}
          sub={t("parking.stats.liveCapacity")}
          icon="✅"
          domain="operate"
        />
        <StatCard
          label={t("parking.stats.activeSessions")}
          value={String(activeSessions.length)}
          sub={
            sessionsSummary.revenuePending
              ? formatMoney(sessionsSummary.revenuePending)
              : t("parking.stats.noFeesYet")
          }
          icon="🎫"
          domain="operate"
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="parking-tab-overview">
            {t("parking.tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="vehicles" data-testid="parking-tab-vehicles">
            {t("parking.tabs.vehicles")}
          </TabsTrigger>
          <TabsTrigger value="sessions" data-testid="parking-tab-sessions">
            {t("parking.tabs.sessions")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card
              className="border-border/60 bg-card/70 p-4"
              data-testid="parking-card-occupancy"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("parking.dashboard.zoneOccupancy")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("parking.dashboard.zoneOccupancyHint")}
                  </p>
                </div>
                <Badge className={occupancyTone(totals.occupancyPercent)}>
                  {totals.occupancyPercent}%
                </Badge>
              </div>
              <div className="space-y-3">
                {filteredZones.map((zone) => {
                  const occupied = zone.active_session_count ?? 0;
                  const percent =
                    zone.total_spaces > 0
                      ? Math.round((occupied / zone.total_spaces) * 100)
                      : 0;
                  return (
                    <div
                      key={zone.id}
                      className="rounded-xl border border-border/60 bg-background/40 p-3"
                      data-testid={`parking-card-zone-${zone.id}`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">
                            {zone.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {lotMap.get(zone.lot_id)?.name ?? "—"}{" "}
                            {zone.level ? `• ${zone.level}` : ""}
                          </div>
                        </div>
                        <Badge className={occupancyTone(percent)}>
                          {percent}%
                        </Badge>
                      </div>
                      <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            percent >= 95
                              ? "bg-destructive"
                              : percent >= 85
                                ? "bg-warning"
                                : "bg-success",
                          )}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {t("parking.dashboard.occupiedCount", {
                            occupied,
                            total: zone.total_spaces,
                          })}
                        </span>
                        <span>
                          {(zone.vehicle_types ?? [])
                            .map((item) => t(`parking.vehicleTypes.${item}`))
                            .join(", ") || "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {!filteredZones.length && (
                  <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("parking.empty.zones")}
                  </div>
                )}
              </div>
            </Card>

            <Card
              className="border-border/60 bg-card/70 p-4"
              data-testid="parking-card-live-summary"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("parking.dashboard.liveOperations")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("parking.dashboard.liveOperationsHint")}
                  </p>
                </div>
                <Gauge className="size-4 text-operate" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <CircleDot className="size-4 text-success" />
                    {t("parking.dashboard.activeNow")}
                  </div>
                  <div className="text-2xl font-semibold text-foreground">
                    {activeSessions.length}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <CircleOff className="size-4 text-muted-foreground" />
                    {t("parking.dashboard.availableNow")}
                  </div>
                  <div className="text-2xl font-semibold text-foreground">
                    {totals.availableSpaces}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldAlert className="size-4 text-warning" />
                    {t("parking.dashboard.disputed")}
                  </div>
                  <div className="text-2xl font-semibold text-foreground">
                    {sessionsSummary.disputed}
                  </div>
                </div>
                <div
                  className="rounded-xl border border-border/60 bg-background/40 p-3"
                  data-testid="parking-card-active-passes"
                >
                  <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <CarFront className="size-4 text-operate" />
                    Active passes
                  </div>
                  <div className="text-xl font-semibold text-foreground">
                    {activePasses.length}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <CarFront className="size-4 text-operate" />
                    {t("parking.dashboard.pendingFees")}
                  </div>
                  <div className="text-xl font-semibold text-foreground">
                    {formatMoney(sessionsSummary.revenuePending)}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vehicles">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-border/60 bg-card/70 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("parking.vehicles.title")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("parking.vehicles.description")}
                  </p>
                </div>
                <Input
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  placeholder={t("parking.searchVehicles")}
                  className="w-full max-w-[260px]"
                  data-testid="parking-input-vehicle-search"
                />
              </div>
              <DataTable
                columns={vehicleColumns}
                data={vehicles}
                rowKey={(vehicle) => vehicle.id}
                onRowClick={(vehicle) => setSelectedVehicleId(vehicle.id)}
                rowClassName={(vehicle) =>
                  cn(
                    "cursor-pointer",
                    selectedVehicleId === vehicle.id && "bg-operate/5",
                  )
                }
                paginate={false}
                data-testid="parking-table-vehicles"
                rowTestId={(vehicle) => `parking-row-vehicle-${vehicle.id}`}
              />
            </Card>

            <Card
              className="border-border/60 bg-card/70 p-4"
              data-testid="parking-card-vehicle-detail"
            >
              {!selectedVehicle ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
                  {t("parking.vehicles.emptyDetail")}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-foreground font-mono">
                        {selectedVehicle.plate_number}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {selectedVehicle.brand ||
                          t("parking.common.unassigned")}{" "}
                        {selectedVehicle.color
                          ? `• ${selectedVehicle.color}`
                          : ""}
                      </div>
                    </div>
                    <Badge>
                      {t(
                        `parking.registrationStatus.${selectedVehicle.registration_status}`,
                      )}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                      <div className="text-xs text-muted-foreground">
                        {t("parking.table.type")}
                      </div>
                      <div className="mt-1 font-medium">
                        {t(`parking.vehicleTypes.${selectedVehicle.type}`)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                      <div className="text-xs text-muted-foreground">
                        {t("parking.table.category")}
                      </div>
                      <div className="mt-1 font-medium">
                        {t(`parking.categories.${selectedVehicle.category}`)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium text-foreground">
                      {t("parking.vehicles.recentSessions")}
                    </div>
                    <div className="space-y-2">
                      {vehicleDetailSessions.map((session) => (
                        <div
                          key={session.id}
                          className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm"
                          data-testid={`parking-card-vehicle-session-${session.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              {zoneMap.get(session.zone_id)?.name ?? "—"}
                            </div>
                            <Badge variant="secondary">
                              {t(`parking.sessionStatus.${session.status}`)}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDateTime(session.entry_time)} •{" "}
                            {formatMinutes(getSessionDurationMinutes(session))}
                          </div>
                        </div>
                      ))}
                      {!vehicleDetailSessions.length && (
                        <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                          {t("parking.empty.vehicleSessions")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sessions">
          <Card className="border-border/60 bg-card/70 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t("parking.sessions.title")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("parking.sessions.description")}
                </p>
              </div>
              <Input
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder={t("parking.searchSessions")}
                className="w-full max-w-[260px]"
                data-testid="parking-input-session-search"
              />
            </div>
            <DataTable
              columns={sessionColumns}
              data={activeSessions}
              rowKey={(session) => session.id}
              paginate={false}
              data-testid="parking-table-sessions"
              rowTestId={(session) => `parking-row-session-${session.id}`}
            />
          </Card>
        </TabsContent>
      </Tabs>

      <AppModal
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        title={t("parking.modals.registerVehicle.title")}
        description={t("parking.modals.registerVehicle.description")}
        size="lg"
        showCancelButton
        cancelLabel={t("common.cancel")}
        primaryAction={{
          label: t("parking.actions.saveVehicle"),
          onClick: handleRegisterVehicle,
          loading: registerVehicle.isPending,
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="parking-register-plate">
              {t("parking.table.plate")}
            </Label>
            <Input
              id="parking-register-plate"
              value={vehicleForm.plate_number}
              onChange={(e) =>
                setVehicleForm((prev) => ({
                  ...prev,
                  plate_number: e.target.value,
                }))
              }
              data-testid="parking-input-register-plate"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.type")}</Label>
            <Select
              value={vehicleForm.type}
              onValueChange={(value) =>
                setVehicleForm((prev) => ({ ...prev, type: value }))
              }
              options={["motorbike", "car", "bicycle", "truck"].map(
                (value) => ({
                  value,
                  label: t(`parking.vehicleTypes.${value}`),
                }),
              )}
              data-testid="parking-select-register-type"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.category")}</Label>
            <Select
              value={vehicleForm.category}
              onValueChange={(value) =>
                setVehicleForm((prev) => ({ ...prev, category: value }))
              }
              options={["resident", "visitor", "temporary"].map((value) => ({
                value,
                label: t(`parking.categories.${value}`),
              }))}
              data-testid="parking-select-register-category"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.status")}</Label>
            <Select
              value={vehicleForm.registration_status}
              onValueChange={(value) =>
                setVehicleForm((prev) => ({
                  ...prev,
                  registration_status: value,
                }))
              }
              options={["registered", "visitor", "blacklisted"].map(
                (value) => ({
                  value,
                  label: t(`parking.registrationStatus.${value}`),
                }),
              )}
              data-testid="parking-select-register-status"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.brand")}</Label>
            <Input
              value={vehicleForm.brand}
              onChange={(e) =>
                setVehicleForm((prev) => ({ ...prev, brand: e.target.value }))
              }
              data-testid="parking-input-register-brand"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.color")}</Label>
            <Input
              value={vehicleForm.color}
              onChange={(e) =>
                setVehicleForm((prev) => ({ ...prev, color: e.target.value }))
              }
              data-testid="parking-input-register-color"
            />
          </div>
        </div>
      </AppModal>

      <AppModal
        open={entryOpen}
        onOpenChange={setEntryOpen}
        title={t("parking.modals.manualEntry.title")}
        description={t("parking.modals.manualEntry.description")}
        size="lg"
        showCancelButton
        cancelLabel={t("common.cancel")}
        primaryAction={{
          label: t("parking.actions.confirmEntry"),
          onClick: handleCreateEntry,
          loading: createEntry.isPending,
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("parking.table.lot")}</Label>
            <Select
              value={entryForm.lot_id}
              onValueChange={(value) =>
                setEntryForm((prev) => ({
                  ...prev,
                  lot_id: value,
                  zone_id: "",
                }))
              }
              options={lots.map((lot) => ({ value: lot.id, label: lot.name }))}
              data-testid="parking-select-entry-lot"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.zone")}</Label>
            <Select
              value={entryForm.zone_id}
              onValueChange={(value) =>
                setEntryForm((prev) => ({ ...prev, zone_id: value }))
              }
              options={selectedZonesForEntry.map((zone) => ({
                value: zone.id,
                label: `${zone.name}${zone.level ? ` • ${zone.level}` : ""}`,
              }))}
              data-testid="parking-select-entry-zone"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.plate")}</Label>
            <Input
              value={entryForm.plate_number}
              onChange={(e) =>
                setEntryForm((prev) => ({
                  ...prev,
                  plate_number: e.target.value,
                }))
              }
              data-testid="parking-input-entry-plate"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.type")}</Label>
            <Select
              value={entryForm.vehicle_type}
              onValueChange={(value) =>
                setEntryForm((prev) => ({ ...prev, vehicle_type: value }))
              }
              options={["motorbike", "car", "bicycle", "truck"].map(
                (value) => ({
                  value,
                  label: t(`parking.vehicleTypes.${value}`),
                }),
              )}
              data-testid="parking-select-entry-type"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t("parking.table.device")}</Label>
            <Input
              value={entryForm.entry_device_id}
              onChange={(e) =>
                setEntryForm((prev) => ({
                  ...prev,
                  entry_device_id: e.target.value,
                }))
              }
              placeholder={t("parking.placeholders.deviceOptional")}
              data-testid="parking-input-entry-device"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t("parking.table.notes")}</Label>
            <Textarea
              value={entryForm.notes}
              onChange={(e) =>
                setEntryForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              data-testid="parking-textarea-entry-notes"
            />
          </div>
        </div>
      </AppModal>

      <AppModal
        open={recognitionOpen}
        onOpenChange={setRecognitionOpen}
        title="Simulate ANPR"
        description="Run the plate recognition and barrier decision flow against the current parking contracts."
        size="lg"
        showCancelButton
        cancelLabel={t("common.cancel")}
        primaryAction={{
          label: "Run decision",
          onClick: handleRecognizePlate,
          loading: recognizePlate.isPending,
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Lot</Label>
            <Select
              value={recognitionForm.lot_id}
              onValueChange={(value) =>
                setRecognitionForm((prev) => ({
                  ...prev,
                  lot_id: value,
                  zone_id: "",
                }))
              }
              options={lots.map((lot) => ({ value: lot.id, label: lot.name }))}
              data-testid="parking-select-recognition-lot"
            />
          </div>
          <div className="space-y-2">
            <Label>Zone</Label>
            <Select
              value={recognitionForm.zone_id}
              onValueChange={(value) =>
                setRecognitionForm((prev) => ({ ...prev, zone_id: value }))
              }
              options={selectedZonesForEntry.map((zone) => ({
                value: zone.id,
                label: zone.name,
              }))}
              data-testid="parking-select-recognition-zone"
            />
          </div>
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select
              value={recognitionForm.direction}
              onValueChange={(value) =>
                setRecognitionForm((prev) => ({
                  ...prev,
                  direction: value as "entry" | "exit",
                }))
              }
              options={[
                { value: "entry", label: "Entry" },
                { value: "exit", label: "Exit" },
              ]}
              data-testid="parking-select-recognition-direction"
            />
          </div>
          <div className="space-y-2">
            <Label>Plate</Label>
            <Input
              value={recognitionForm.plate_number}
              onChange={(e) =>
                setRecognitionForm((prev) => ({
                  ...prev,
                  plate_number: e.target.value,
                }))
              }
              data-testid="parking-input-recognition-plate"
            />
          </div>
          <div className="space-y-2">
            <Label>Vehicle type</Label>
            <Select
              value={recognitionForm.vehicle_type}
              onValueChange={(value) =>
                setRecognitionForm((prev) => ({ ...prev, vehicle_type: value }))
              }
              options={["motorbike", "car", "bicycle", "truck"].map(
                (value) => ({
                  value,
                  label: t(`parking.vehicleTypes.${value}`),
                }),
              )}
              data-testid="parking-select-recognition-type"
            />
          </div>
          <div className="space-y-2">
            <Label>Confidence</Label>
            <Input
              value={recognitionForm.confidence}
              onChange={(e) =>
                setRecognitionForm((prev) => ({
                  ...prev,
                  confidence: e.target.value,
                }))
              }
              data-testid="parking-input-recognition-confidence"
            />
          </div>
        </div>
      </AppModal>

      <AppModal
        open={passOpen}
        onOpenChange={setPassOpen}
        title="Issue parking pass"
        description="Grant a resident/subscriber pass to a registered vehicle."
        size="lg"
        showCancelButton
        cancelLabel={t("common.cancel")}
        primaryAction={{
          label: "Issue pass",
          onClick: handleCreatePass,
          loading: createPass.isPending,
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Vehicle</Label>
            <Select
              value={passForm.vehicle_id}
              onValueChange={(value) =>
                setPassForm((prev) => ({ ...prev, vehicle_id: value }))
              }
              options={vehicles.map((vehicle) => ({
                value: vehicle.id,
                label: vehicle.plate_number,
              }))}
              data-testid="parking-select-pass-vehicle"
            />
          </div>
          <div className="space-y-2">
            <Label>Zone</Label>
            <Select
              value={passForm.zone_id}
              onValueChange={(value) =>
                setPassForm((prev) => ({ ...prev, zone_id: value }))
              }
              options={zones.map((zone) => ({
                value: zone.id,
                label: zone.name,
              }))}
              data-testid="parking-select-pass-zone"
            />
          </div>
          <div className="space-y-2">
            <Label>Fee amount</Label>
            <Input
              value={passForm.fee_amount}
              onChange={(e) =>
                setPassForm((prev) => ({ ...prev, fee_amount: e.target.value }))
              }
              data-testid="parking-input-pass-fee"
            />
          </div>
          <div className="space-y-2">
            <Label>Valid from</Label>
            <Input
              type="date"
              value={passForm.valid_from}
              onChange={(e) =>
                setPassForm((prev) => ({ ...prev, valid_from: e.target.value }))
              }
              data-testid="parking-input-pass-valid-from"
            />
          </div>
          <div className="space-y-2">
            <Label>Valid until</Label>
            <Input
              type="date"
              value={passForm.valid_until}
              onChange={(e) =>
                setPassForm((prev) => ({
                  ...prev,
                  valid_until: e.target.value,
                }))
              }
              data-testid="parking-input-pass-valid-until"
            />
          </div>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(paymentSession)}
        onOpenChange={(open) => {
          if (!open) setPaymentSession(null);
        }}
        title="Collect parking fee"
        description={
          paymentSession
            ? `Complete payment for ${paymentSession.plate_number}`
            : ""
        }
        size="md"
        showCancelButton
        cancelLabel={t("common.cancel")}
        primaryAction={{
          label: "Confirm payment",
          onClick: handlePayment,
          loading: processPayment.isPending,
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              value={paymentForm.amount}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              data-testid="parking-input-payment-amount"
            />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select
              value={paymentForm.method}
              onValueChange={(value) =>
                setPaymentForm((prev) => ({ ...prev, method: value }))
              }
              options={[
                { value: "cash", label: "Cash" },
                { value: "card", label: "Card" },
                { value: "ewallet", label: "E-wallet" },
              ]}
              data-testid="parking-select-payment-method"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Reference</Label>
            <Input
              value={paymentForm.reference}
              onChange={(e) =>
                setPaymentForm((prev) => ({
                  ...prev,
                  reference: e.target.value,
                }))
              }
              data-testid="parking-input-payment-reference"
            />
          </div>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(exitSession)}
        onOpenChange={(open) => {
          if (!open) setExitSession(null);
        }}
        title={t("parking.modals.manualExit.title")}
        description={
          exitSession
            ? t("parking.modals.manualExit.description", {
                plate: exitSession.plate_number,
              })
            : ""
        }
        size="lg"
        showCancelButton
        cancelLabel={t("common.cancel")}
        primaryAction={{
          label: t("parking.actions.confirmExit"),
          onClick: handleExitSession,
          loading: exitSessionMutation.isPending,
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("parking.table.plate")}</Label>
            <Input
              value={exitForm.plate_number}
              onChange={(e) =>
                setExitForm((prev) => ({
                  ...prev,
                  plate_number: e.target.value,
                }))
              }
              data-testid="parking-input-exit-plate"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("parking.table.device")}</Label>
            <Input
              value={exitForm.exit_device_id}
              onChange={(e) =>
                setExitForm((prev) => ({
                  ...prev,
                  exit_device_id: e.target.value,
                }))
              }
              placeholder={t("parking.placeholders.deviceOptional")}
              data-testid="parking-input-exit-device"
            />
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-3 md:col-span-2 text-sm">
            <div className="mb-1 font-medium text-foreground">
              {t("parking.modals.manualExit.sessionSummary")}
            </div>
            <div className="text-muted-foreground">
              {exitSession
                ? `${zoneMap.get(exitSession.zone_id)?.name ?? "—"} • ${formatDateTime(exitSession.entry_time)} • ${formatMinutes(getSessionDurationMinutes(exitSession))}`
                : "—"}
            </div>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
