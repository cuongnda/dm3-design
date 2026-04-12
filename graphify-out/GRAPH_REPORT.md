# Graph Report - .  (2026-04-11)

## Corpus Check
- 538 files · ~1,261,916 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4263 nodes · 6250 edges · 197 communities detected
- Extraction: 69% EXTRACTED · 31% INFERRED · 0% AMBIGUOUS · INFERRED: 1944 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `DM3Client` - 170 edges
2. `DeviceDatabase` - 90 edges
3. `VirtualDevice` - 68 edges
4. `SimulationConfig` - 64 edges
5. `apiFetch()` - 61 edges
6. `ProvisioningStatus` - 54 edges
7. `SimulatorAPI` - 43 edges
8. `AccessEngine` - 39 edges
9. `WebTestExecutor` - 35 edges
10. `PersonRecord` - 33 edges

## Surprising Connections (you probably didn't know these)
- `showToast()` --calls--> `emit()`  [INFERRED]
  packages/ui/src/toast.tsx → apps/console/src/lib/toast.ts
- `dismiss()` --calls--> `emit()`  [INFERRED]
  packages/ui/src/toast.tsx → apps/console/src/lib/toast.ts
- `Tests for database operations.` --uses--> `DeviceDatabase`  [INFERRED]
  simulator/tests/test_database.py → simulator/src/dm3_simulator/database.py
- `Sync protocol — handles full and incremental sync from server.` --uses--> `DeviceDatabase`  [INFERRED]
  simulator/src/dm3_simulator/sync.py → simulator/src/dm3_simulator/database.py
- `Configuration loading from YAML files and environment variables.` --uses--> `SimulationConfig`  [INFERRED]
  simulator/src/dm3_simulator/config.py → simulator/src/dm3_simulator/models.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (180): AccessEngine, _decision(), evaluate_schedule(), Access decision engine — the core of the simulator.  All decisions are made loca, Build an AccessDecision with timing., Check if current time falls within any schedule period.      Args:         sched, Offline-first access decision engine.      Evaluates access requests against the, Evaluate an access request and return a decision.          Args:             cre (+172 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (187): DM3Client, Build full URL from relative path., Login and store access token., Complete two-step login with company selection., Authenticated API client for DM3 backend., admin_client(), api_client(), cleanup_test_data() (+179 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (15): DM3 API Client — shared helper for API tests., clampDate(), handlePickRange(), handlePickSingle(), isDisabled(), setMonth(), DM3 Automation Test Constants Load from .env file or use defaults for local deve, handleRowClick() (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (61): isSlotInvalid(), isTimeValid(), ApiPutData(), ApiUartPrintf(), ApiUartPutByte(), ApiUartPutChar(), ApiUartPutString(), HOST_printf() (+53 more)

### Community 4 - "Community 4"
Cohesion: 0.01
Nodes (84): createAccessGroupRequest, updateAccessGroupRequest, AuthHandlers, getClientIP(), LoginRequest, LoginResponse, NewAuthHandlers(), RegisterAuthRoutes() (+76 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (81): apiFetch(), assignAccessTime(), clearToken(), connectWebSocket(), createAccessDevice(), createAccessTimeTemplate(), createAccount(), createCompany() (+73 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (54): AccessClaims, AccessHandlers, accountForLogin, addMemberRequest, AuditHandlers, auditLogRow, AuthHandlers, canApproveVisit() (+46 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (25): getJniEnv(), init(), RGB_LED_Control(), RGB_LED_Write(), DualRFJni, DualSAMJni, DualTOFJni, DualWiegandJni (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (4): emptyForm(), openCreate(), openEdit(), ruleToForm()

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (60): DM3-67: Account Management API Tests Tests for user account CRUD operations and, Test account management API endpoints., Setup test client with system admin auth., Create a test account; skip test if backend refuses (e.g. 409)., # TODO: Test with regular user when available, Test account list page loads and displays accounts., Should list user accounts with pagination., Test filter accounts by role dropdown. (+52 more)

### Community 10 - "Community 10"
Cohesion: 0.02
Nodes (27): Auth(), contextKey, updateMePreferences(), updatePreferredLanguage(), writeErr(), apiFetch(), clearToken(), Client (+19 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (40): ApiPutData(), ApiUartClose(), ApiUartInitBuffer(), ApiUartPrintf(), ApiUartPutByte(), ApiUartPutChar(), ApiUartPutString(), DbgPrintf() (+32 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (56): AccessDevice, AccessGroup, AccessGroupAccessPoint, AccessGroupUser, AccessPoint, AccessPointDevice, AccessRule, AccessTime (+48 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (25): AssetAuthMiddleware(), AuthMiddleware(), ClaimsFromContext(), contextKey, formatPanicError(), IsolationMode, loadTenantInfo(), Middleware() (+17 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (67): Clear_snsts_byte(), ConvSequenceI(), Get_Tick(), ISO7816_Activation(), ISO7816_Activation2(), ISO7816_Activation_Sec(), ISO7816_ActivationFlow(), ISO7816_ATR_Test() (+59 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (66): Clear_snsts_byte(), ConvSequenceI(), Get_Tick(), ISO7816_Activation(), ISO7816_Activation2(), ISO7816_Activation_Sec(), ISO7816_ActivationFlow(), ISO7816_ATR_Test() (+58 more)

### Community 16 - "Community 16"
Cohesion: 0.06
Nodes (56): Find_I2C_Channel(), get_BL_cmd_buf(), get_BL_rsp_buf(), get_usec_timestamp(), is_BL_cmd_busy(), TMF8801_cr_addpair(), TMF8801_cr_init(), TMF8801_cr_map() (+48 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (32): ActorFromContext(), ContextExtractor, Diff(), Entry, IPFromRequest(), jsonEqual(), Logger, New() (+24 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (47): CheckAdjacentPixels(), CheckEEPROMValid(), color565(), DevThermal_close(), DevThermal_GetDumpData(), DevThermal_GetFrameData(), DevThermal_open(), drawFastVLine() (+39 more)

### Community 19 - "Community 19"
Cohesion: 0.03
Nodes (6): DepartmentManagementPage, DepartmentModal, ImportExportModal, TestUtils, UserAssignmentModal, TestDataFactory

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (32): AccessHandlers, barrierCommand, calculateFee(), calculateTieredFee(), createParkingFeeRuleRequest, createParkingLotRequest, createParkingPassRequest, createParkingSessionRequest (+24 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (56): auto_mode(), check_and_run(), check_status(), discover_test_files(), _generate_execution_reports(), _generate_module_artifacts(), generate_reports(), get_changed_files() (+48 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (52): access_point(), access_time(), api(), login_as_admin(), navigate_to_access_groups(), E2E Tests: Access Group Management UI Tests for creating, editing, viewing, and, Test access group list page UI., Test access group creation flow. (+44 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (15): setupListVisitsRouter(), setupMutationRouter(), setupWatchlistRouter(), TestGetVisitNotFound(), TestGetVisitReturnsJoinedData(), TestListVisitsDefaultPagination(), TestListVisitsFilterByDate(), TestListVisitsFilterByStatus() (+7 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (8): AccessRuleDao, BlacklistDao, CredentialDao, EventQueueDao, FailedAttemptsDao, PersonDao, PersonGroupDao, SyncStateDao

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (18): client(), API Tests: Access Time Management Tests: list, create, get, update, delete templ, Empty time slots should still succeed (template without schedule)., Create a template for other tests, clean up after., Login via auth-svc, then talk to access-svc., Replace all time slots., Same name in same tenant should fail (unique constraint)., Create a 7-day schedule with multiple slots per day. (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.09
Nodes (18): checkinRequest, checkoutCleanup, checkoutOptions, createVisitRequest, derefString(), endOfDay(), ensureTemporaryAccess(), getVisitByIDTx() (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.08
Nodes (18): Config, env(), envInt(), envSlice(), Load(), load_config(), Configuration loading from YAML files and environment variables., Load configuration from YAML file, env vars, and CLI overrides.      Priority: C (+10 more)

### Community 28 - "Community 28"
Cohesion: 0.06
Nodes (14): AccessControlManager, AccessEvent, FaceDenied, FaceDetected, FaceGranted, FrameData, HardwareStatus, Idle (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (32): apiWiegand_close(), apiWiegand_GetLastFrame(), apiWiegand_open(), apiWiegand_SendSetFinish(), apiWiegand_SendSetStart(), apiWiegand_setDebug(), apiWIEGAND_version(), apiWiegand_WGD0_Control() (+24 more)

### Community 30 - "Community 30"
Cohesion: 0.07
Nodes (16): Claims, ValidateToken(), Tenant Security Tests  These tests verify security aspects of tenant isolation i, Test that non-admin users cannot use company_id query parameter, Test that SQL injection attempts in tenant context are prevented, Test that users cannot switch tenants without proper authentication, Test security aspects of tenant isolation, Test that tenant data cannot be enumerated through ID guessing (+8 more)

### Community 31 - "Community 31"
Cohesion: 0.07
Nodes (6): BulkOperationRequest, BulkOperationResponse, CreateUserRequest, getUserIDFromContext(), UpdateUserRequest, UserManagementHandlers

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (15): Tenant Isolation API Tests  These tests verify that tenant isolation is properly, Test that users cannot access devices from other tenants, Test that users cannot access persons from other tenants, Test that new devices are automatically assigned to the user's tenant, Test tenant isolation enforcement in API endpoints, Test that new persons are automatically assigned to the user's tenant, Test that access rules are properly isolated by tenant, Test that system admins can access data from multiple tenants when scoped (+7 more)

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (14): Database-level Tenant Isolation Tests  These tests verify that tenant isolation, Test that tenant_id foreign key constraints to companies table work, Test that queries with tenant filters only return data for that tenant, Test that queries without tenant filters don't accidentally return cross-tenant, Test the database audit function for tenant isolation, Test tenant isolation at the database level, Test the tenant usage statistics view, Test that TimescaleDB hypertables properly partition by tenant (+6 more)

### Community 34 - "Community 34"
Cohesion: 0.07
Nodes (8): API Tests: Company CRUD operations Tests: list, create, get, update, suspend/act, Create a test company for CRUD operations, clean up after., test_company(), TestCreateCompany, TestGetCompany, TestListCompanies, TestSuspendCompany, TestUpdateCompany

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (9): AccessHandlers, buildZoneMapObjectKey(), buildZoneMapPublicPath(), createZoneRequest, managedAssetObjectKey(), scanZone(), updateZoneMapRequest, updateZoneRequest (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (1): HardwareController

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (8): accessLogData, heartbeatData, heartbeatNetwork, heartbeatPeripherals, MQTTEnvelope, MQTTHandler, ParsedTopic, ParseTopic()

### Community 38 - "Community 38"
Cohesion: 0.1
Nodes (2): DualCardResponse, DualThermalJni

### Community 39 - "Community 39"
Cohesion: 0.1
Nodes (6): DoorAlarm, DoorController, DoorState, ForcedOpen, HeldOpen, TamperDetected

### Community 40 - "Community 40"
Cohesion: 0.11
Nodes (8): Approved, BootstrapState, Connecting, DeviceConfigViewModel, Error, Idle, Rejected, WaitingApproval

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (3): OtaState, OtaStatus, OtaUpdateManager

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (17): generate_card_uid(), generate_face_hash(), generate_mock_persons(), generate_mock_rules(), generate_pin(), generate_vietnamese_name(), pick_denial_reason(), pick_event_type() (+9 more)

### Community 43 - "Community 43"
Cohesion: 0.16
Nodes (12): generate_video_for_report(), generate_videos_for_reports(), _load_font(), Create MP4 video from prepared frames using ffmpeg., Generate video for a single execution report JSON. Returns video path or None., Generate videos for all execution report JSONs., Load a font cross-platform, fallback to Pillow default., Generate videos from test execution screenshots. (+4 more)

### Community 44 - "Community 44"
Cohesion: 0.14
Nodes (4): AccessHandlers, createAccessPointRequest, scanAccessPoint(), updateAccessPointRequest

### Community 45 - "Community 45"
Cohesion: 0.12
Nodes (2): MqttConnectionState, MqttService

### Community 46 - "Community 46"
Cohesion: 0.18
Nodes (2): QueryBuilder, TenantAwareDB

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (6): AccountInfo, AuthService, generateSecureToken(), getStringPtr(), hashToken(), SessionInfo

### Community 48 - "Community 48"
Cohesion: 0.12
Nodes (1): CommandHandler

### Community 49 - "Community 49"
Cohesion: 0.12
Nodes (1): DM3Repository

### Community 50 - "Community 50"
Cohesion: 0.22
Nodes (1): AccessHandlers

### Community 51 - "Community 51"
Cohesion: 0.14
Nodes (1): UserManagementHandlers

### Community 52 - "Community 52"
Cohesion: 0.14
Nodes (1): AppModule

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (1): Tests for database operations.

### Community 54 - "Community 54"
Cohesion: 0.15
Nodes (8): MultiFactorManager, MultiFactorResult, PendingFactor, PendingSecondFactor, PersonMismatch, SameFactorRejected, Satisfied, Timeout

### Community 55 - "Community 55"
Cohesion: 0.26
Nodes (12): auto_width(), collect_from_last_run(), collect_from_pytest_json(), generate_report(), main(), Parse pytest-json-report output., Collect results from pytest cache / report.html as fallback., Generate Excel report for API or Web tests. (+4 more)

### Community 56 - "Community 56"
Cohesion: 0.2
Nodes (3): mustJSON(), TestCalculateFee(), TestRoundFeeToNearestThousand()

### Community 57 - "Community 57"
Cohesion: 0.23
Nodes (1): AuthHandlers

### Community 58 - "Community 58"
Cohesion: 0.17
Nodes (9): Denied, FaceDetected, Granted, Idle, MultiFactorPending, PinRequired, RecognitionUiState, RecognitionViewModel (+1 more)

### Community 59 - "Community 59"
Cohesion: 0.17
Nodes (8): Capturing, Complete, EnrollmentStep, EnrollmentUiState, Error, FaceEnrollmentViewModel, Idle, Processing

### Community 60 - "Community 60"
Cohesion: 0.17
Nodes (1): SyncManager

### Community 61 - "Community 61"
Cohesion: 0.17
Nodes (1): AppDatabase

### Community 62 - "Community 62"
Cohesion: 0.27
Nodes (8): buildIdentityImageObjectKey(), buildIdentityImagePublicPath(), derefString(), IdentityHandlers, identityImageExtension(), identityImageVariant, managedIdentityAssetObjectKey(), uploadError

### Community 63 - "Community 63"
Cohesion: 0.18
Nodes (1): AccessHandlers

### Community 64 - "Community 64"
Cohesion: 0.18
Nodes (2): NfcCardEvent, NfcCardService

### Community 65 - "Community 65"
Cohesion: 0.18
Nodes (10): AccessRuleEntity, BlacklistEntity, ConfigEntity, CredentialEntity, EventQueueEntity, FaceTemplateEntity, FailedAttemptsEntity, PersonEntity (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (8): create_zone(), find_zone_node_by_name(), login_as_admin(), E2E tests for spatial zone workflows. Covers zone spatial metadata and access po, select_option_by_text(), test_create_and_update_zone_with_tree_navigation(), test_zone_detail_map_view_updates_access_point_coordinates(), TestSpatialZones

### Community 67 - "Community 67"
Cohesion: 0.2
Nodes (6): ActivateDeviceViewModel, Activating, ActivationState, Error, Scanning, Success

### Community 68 - "Community 68"
Cohesion: 0.2
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 0.2
Nodes (2): FacePassManager, FaceResult

### Community 70 - "Community 70"
Cohesion: 0.2
Nodes (1): WiegandReader

### Community 71 - "Community 71"
Cohesion: 0.2
Nodes (6): ActivationResponse, ApiResult, Error, ProvisioningApi, Success, TokenRefreshResponse

### Community 72 - "Community 72"
Cohesion: 0.2
Nodes (1): MqttForegroundService

### Community 73 - "Community 73"
Cohesion: 0.2
Nodes (2): FaceRecognitionService, LocalBinder

### Community 74 - "Community 74"
Cohesion: 0.22
Nodes (1): IdentityHandlers

### Community 75 - "Community 75"
Cohesion: 0.22
Nodes (2): FaceCamera, FrameCallback

### Community 76 - "Community 76"
Cohesion: 0.22
Nodes (1): CrashWatchdog

### Community 77 - "Community 77"
Cohesion: 0.22
Nodes (1): FaceTemplateDao

### Community 78 - "Community 78"
Cohesion: 0.25
Nodes (1): IdentityHandlers

### Community 79 - "Community 79"
Cohesion: 0.25
Nodes (7): Credential, IdentityStats, SyncResponse, User, UserGroup, UserGroupMember, Vehicle

### Community 80 - "Community 80"
Cohesion: 0.25
Nodes (1): HardwareFingerprint

### Community 81 - "Community 81"
Cohesion: 0.29
Nodes (1): responseWriter

### Community 82 - "Community 82"
Cohesion: 0.29
Nodes (1): MainActivity

### Community 83 - "Community 83"
Cohesion: 0.29
Nodes (1): FaceRecognitionSettingsViewModel

### Community 84 - "Community 84"
Cohesion: 0.29
Nodes (2): AdminStats, AdminViewModel

### Community 85 - "Community 85"
Cohesion: 0.29
Nodes (1): DeviceStats

### Community 86 - "Community 86"
Cohesion: 0.29
Nodes (1): NfcReader

### Community 87 - "Community 87"
Cohesion: 0.29
Nodes (1): HardwareModule

### Community 88 - "Community 88"
Cohesion: 0.29
Nodes (1): DM3DeviceAdminReceiver

### Community 89 - "Community 89"
Cohesion: 0.29
Nodes (1): KioskManager

### Community 90 - "Community 90"
Cohesion: 0.38
Nodes (6): generate_html_report(), generate_reports_for_all(), _get_step_field(), Get first available field from step dict., Generate HTML reports for all JSON execution files (skips if HTML already exists, Generate HTML report from execution JSON file. Returns HTML path.

### Community 91 - "Community 91"
Cohesion: 0.33
Nodes (2): handleDrop(), handleFileSelect()

### Community 92 - "Community 92"
Cohesion: 0.33
Nodes (1): VisitorHandlers

### Community 93 - "Community 93"
Cohesion: 0.33
Nodes (1): VisitorHandlers

### Community 94 - "Community 94"
Cohesion: 0.33
Nodes (5): createUserAccountRequest, createUserAccountResponse, updateUserAccountRequest, userAccountResponse, userCompanyInfo

### Community 95 - "Community 95"
Cohesion: 0.33
Nodes (5): companyStat, deviceStat, recentStat, systemStats, userStat

### Community 96 - "Community 96"
Cohesion: 0.33
Nodes (5): adminInfo, companyResponse, createCompanyRequest, createCompanyResponse, updateCompanyRequest

### Community 97 - "Community 97"
Cohesion: 0.33
Nodes (1): AuthHandlers

### Community 98 - "Community 98"
Cohesion: 0.33
Nodes (0): 

### Community 99 - "Community 99"
Cohesion: 0.47
Nodes (5): Error(), ErrorResponse, JSON(), Paginated(), PaginatedResponse

### Community 100 - "Community 100"
Cohesion: 0.33
Nodes (1): ConfigDao

### Community 101 - "Community 101"
Cohesion: 0.33
Nodes (2): AccessDecision, AccessEngine

### Community 102 - "Community 102"
Cohesion: 0.4
Nodes (1): VisitorHandlers

### Community 103 - "Community 103"
Cohesion: 0.7
Nodes (1): VisitorHandlers

### Community 104 - "Community 104"
Cohesion: 0.4
Nodes (0): 

### Community 105 - "Community 105"
Cohesion: 0.4
Nodes (1): Routes

### Community 106 - "Community 106"
Cohesion: 0.4
Nodes (1): WiegandOutput

### Community 107 - "Community 107"
Cohesion: 0.4
Nodes (2): DeviceConfig, DevicePreferences

### Community 108 - "Community 108"
Cohesion: 0.5
Nodes (1): VisitorHandlers

### Community 109 - "Community 109"
Cohesion: 0.5
Nodes (1): VisitorHandlers

### Community 110 - "Community 110"
Cohesion: 0.83
Nodes (1): VisitorHandlers

### Community 111 - "Community 111"
Cohesion: 0.5
Nodes (1): UserItem

### Community 112 - "Community 112"
Cohesion: 0.5
Nodes (1): DeviceInfoProvider

### Community 113 - "Community 113"
Cohesion: 0.5
Nodes (1): EventUploadWorker

### Community 114 - "Community 114"
Cohesion: 0.5
Nodes (1): SyncWorker

### Community 115 - "Community 115"
Cohesion: 0.5
Nodes (1): HeartbeatWorker

### Community 116 - "Community 116"
Cohesion: 0.5
Nodes (1): RecognitionConfig

### Community 117 - "Community 117"
Cohesion: 0.67
Nodes (2): dailyCount, visitorAnalytics

### Community 118 - "Community 118"
Cohesion: 0.67
Nodes (1): VisitorHandlers

### Community 119 - "Community 119"
Cohesion: 0.67
Nodes (0): 

### Community 120 - "Community 120"
Cohesion: 0.67
Nodes (1): DM3TerminalApp

### Community 121 - "Community 121"
Cohesion: 0.67
Nodes (0): 

### Community 122 - "Community 122"
Cohesion: 0.67
Nodes (1): OtaInstallReceiver

### Community 123 - "Community 123"
Cohesion: 0.67
Nodes (1): BootReceiver

### Community 124 - "Community 124"
Cohesion: 0.67
Nodes (1): MockDataSeeder

### Community 125 - "Community 125"
Cohesion: 0.67
Nodes (0): 

### Community 126 - "Community 126"
Cohesion: 0.67
Nodes (0): 

### Community 127 - "Community 127"
Cohesion: 0.67
Nodes (0): 

### Community 128 - "Community 128"
Cohesion: 0.67
Nodes (0): 

### Community 129 - "Community 129"
Cohesion: 1.0
Nodes (0): 

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (0): 

### Community 131 - "Community 131"
Cohesion: 1.0
Nodes (0): 

### Community 132 - "Community 132"
Cohesion: 2.0
Nodes (0): 

### Community 133 - "Community 133"
Cohesion: 1.0
Nodes (1): AccessEvent

### Community 134 - "Community 134"
Cohesion: 1.0
Nodes (1): VisitorHandlers

### Community 135 - "Community 135"
Cohesion: 1.0
Nodes (1): VisitorHandlers

### Community 136 - "Community 136"
Cohesion: 1.0
Nodes (0): 

### Community 137 - "Community 137"
Cohesion: 1.0
Nodes (1): AuthHandlers

### Community 138 - "Community 138"
Cohesion: 1.0
Nodes (0): 

### Community 139 - "Community 139"
Cohesion: 1.0
Nodes (0): 

### Community 140 - "Community 140"
Cohesion: 1.0
Nodes (0): 

### Community 141 - "Community 141"
Cohesion: 1.0
Nodes (0): 

### Community 142 - "Community 142"
Cohesion: 1.0
Nodes (0): 

### Community 143 - "Community 143"
Cohesion: 1.0
Nodes (0): 

### Community 144 - "Community 144"
Cohesion: 1.0
Nodes (0): 

### Community 145 - "Community 145"
Cohesion: 1.0
Nodes (0): 

### Community 146 - "Community 146"
Cohesion: 1.0
Nodes (0): 

### Community 147 - "Community 147"
Cohesion: 1.0
Nodes (0): 

### Community 148 - "Community 148"
Cohesion: 1.0
Nodes (0): 

### Community 149 - "Community 149"
Cohesion: 1.0
Nodes (1): Prometheus metrics for the DM3 simulator.

### Community 150 - "Community 150"
Cohesion: 1.0
Nodes (1): DM3 Device Simulator — asyncio access control device simulator.

### Community 151 - "Community 151"
Cohesion: 1.0
Nodes (0): 

### Community 152 - "Community 152"
Cohesion: 1.0
Nodes (0): 

### Community 153 - "Community 153"
Cohesion: 1.0
Nodes (0): 

### Community 154 - "Community 154"
Cohesion: 1.0
Nodes (0): 

### Community 155 - "Community 155"
Cohesion: 1.0
Nodes (0): 

### Community 156 - "Community 156"
Cohesion: 1.0
Nodes (0): 

### Community 157 - "Community 157"
Cohesion: 1.0
Nodes (0): 

### Community 158 - "Community 158"
Cohesion: 1.0
Nodes (0): 

### Community 159 - "Community 159"
Cohesion: 1.0
Nodes (0): 

### Community 160 - "Community 160"
Cohesion: 1.0
Nodes (0): 

### Community 161 - "Community 161"
Cohesion: 1.0
Nodes (0): 

### Community 162 - "Community 162"
Cohesion: 1.0
Nodes (0): 

### Community 163 - "Community 163"
Cohesion: 1.0
Nodes (0): 

### Community 164 - "Community 164"
Cohesion: 1.0
Nodes (0): 

### Community 165 - "Community 165"
Cohesion: 1.0
Nodes (0): 

### Community 166 - "Community 166"
Cohesion: 1.0
Nodes (0): 

### Community 167 - "Community 167"
Cohesion: 1.0
Nodes (0): 

### Community 168 - "Community 168"
Cohesion: 1.0
Nodes (0): 

### Community 169 - "Community 169"
Cohesion: 1.0
Nodes (0): 

### Community 170 - "Community 170"
Cohesion: 1.0
Nodes (1): Access groups list page should load with table and search.

### Community 171 - "Community 171"
Cohesion: 1.0
Nodes (1): Search input should filter access groups via server-side search.

### Community 172 - "Community 172"
Cohesion: 1.0
Nodes (1): Clicking 'New Group' should open the create modal with form fields.

### Community 173 - "Community 173"
Cohesion: 1.0
Nodes (1): Create should fail without a name.

### Community 174 - "Community 174"
Cohesion: 1.0
Nodes (1): Creating a group with name + access time should succeed.

### Community 175 - "Community 175"
Cohesion: 1.0
Nodes (1): Detail page should show the assigned access time name.

### Community 176 - "Community 176"
Cohesion: 1.0
Nodes (1): Edit modal should have name, description, access time, and default checkbox.

### Community 177 - "Community 177"
Cohesion: 1.0
Nodes (1): Clicking tab triggers should switch between access points and users tabs.

### Community 178 - "Community 178"
Cohesion: 1.0
Nodes (1): AP assigned via API should appear in the access points tab.

### Community 179 - "Community 179"
Cohesion: 1.0
Nodes (1): Add AP modal should show search and available access points.

### Community 180 - "Community 180"
Cohesion: 1.0
Nodes (1): Clean up: remove AP from group via API.

### Community 181 - "Community 181"
Cohesion: 1.0
Nodes (1): User assigned via API should appear in the users tab.

### Community 182 - "Community 182"
Cohesion: 1.0
Nodes (1): Add user modal should show available users.

### Community 183 - "Community 183"
Cohesion: 1.0
Nodes (1): Users tab should have From and Until columns for effective dates.

### Community 184 - "Community 184"
Cohesion: 1.0
Nodes (1): Clean up: remove user from group via API.

### Community 185 - "Community 185"
Cohesion: 1.0
Nodes (1): Add an AP via the Add AP modal: search, select, click Add.

### Community 186 - "Community 186"
Cohesion: 1.0
Nodes (1): Remove an AP via the Remove button in the AP table.

### Community 187 - "Community 187"
Cohesion: 1.0
Nodes (1): Add a user via the Add User modal: select checkbox, click Add.

### Community 188 - "Community 188"
Cohesion: 1.0
Nodes (1): Remove a user via the Remove button in the users table.

### Community 189 - "Community 189"
Cohesion: 1.0
Nodes (1): Edit name and description via the edit modal and verify.

### Community 190 - "Community 190"
Cohesion: 1.0
Nodes (1): Create a throwaway group, then delete it via list page dropdown.

### Community 191 - "Community 191"
Cohesion: 1.0
Nodes (1): Database client for direct database testing

### Community 192 - "Community 192"
Cohesion: 1.0
Nodes (1): Set up test data for database isolation testing

### Community 193 - "Community 193"
Cohesion: 1.0
Nodes (1): Set up multiple tenants for isolation testing

### Community 194 - "Community 194"
Cohesion: 1.0
Nodes (1): Set up test environment for security testing

### Community 195 - "Community 195"
Cohesion: 1.0
Nodes (0): 

### Community 196 - "Community 196"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **530 isolated node(s):** `Department`, `DepartmentFormData`, `DepartmentUser`, `DepartmentManager`, `DepartmentImportData` (+525 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 129`** (2 nodes): `cookie-consent.js`, `loadAnalytics()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (2 nodes): `department_routes.go`, `AddDepartmentRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (2 nodes): `user_management_routes.go`, `AddUserManagementRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (2 nodes): `cors.go`, `CORS()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (2 nodes): `event.go`, `AccessEvent`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (2 nodes): `VisitorHandlers`, `.WalkinVisit()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (2 nodes): `VisitorHandlers`, `.publishEvent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 136`** (2 nodes): `qr.go`, `generateQRToken()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 137`** (2 nodes): `AuthHandlers`, `.SystemStats()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 138`** (2 nodes): `CameraReadyScreen.kt`, `CameraReadyScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 139`** (2 nodes): `GrantedScreen.kt`, `GrantedScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 140`** (2 nodes): `FaceEnrollmentScreen.kt`, `FaceEnrollmentScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 141`** (2 nodes): `NfcScreen.kt`, `NfcScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 142`** (2 nodes): `FaceScanScreen.kt`, `FaceScanScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (2 nodes): `DeniedScreen.kt`, `DeniedScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 144`** (2 nodes): `IdleScreen.kt`, `IdleScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 145`** (2 nodes): `FaceRecognitionSettingsScreen.kt`, `FaceRecognitionSettingsScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 146`** (2 nodes): `QrScanScreen.kt`, `QrScanScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 147`** (2 nodes): `PinScreen.kt`, `PinScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (2 nodes): `Theme.kt`, `DM3Theme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 149`** (2 nodes): `metrics.py`, `Prometheus metrics for the DM3 simulator.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 150`** (2 nodes): `__init__.py`, `DM3 Device Simulator — asyncio access control device simulator.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 151`** (2 nodes): `Heatmap.tsx`, `Heatmap()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 152`** (2 nodes): `SettingsPage.tsx`, `handleSave()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 153`** (2 nodes): `ToastListener.tsx`, `ToastListener()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 154`** (1 nodes): `analytics.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 155`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 156`** (1 nodes): `auth.setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 157`** (1 nodes): `reusable-components.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 158`** (1 nodes): `department-management.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 159`** (1 nodes): `vehicle_handlers.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 160`** (1 nodes): `user_handlers.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 161`** (1 nodes): `build.gradle.kts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 162`** (1 nodes): `settings.gradle.kts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 163`** (1 nodes): `mcu_tmf8801_config.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 164`** (1 nodes): `index.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 165`** (1 nodes): `collapsible.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 166`** (1 nodes): `AreaChart.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 167`** (1 nodes): `DonutChart.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 168`** (1 nodes): `BarChart.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 169`** (1 nodes): `enums.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 170`** (1 nodes): `Access groups list page should load with table and search.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 171`** (1 nodes): `Search input should filter access groups via server-side search.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 172`** (1 nodes): `Clicking 'New Group' should open the create modal with form fields.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 173`** (1 nodes): `Create should fail without a name.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 174`** (1 nodes): `Creating a group with name + access time should succeed.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 175`** (1 nodes): `Detail page should show the assigned access time name.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 176`** (1 nodes): `Edit modal should have name, description, access time, and default checkbox.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (1 nodes): `Clicking tab triggers should switch between access points and users tabs.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 178`** (1 nodes): `AP assigned via API should appear in the access points tab.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (1 nodes): `Add AP modal should show search and available access points.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 180`** (1 nodes): `Clean up: remove AP from group via API.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 181`** (1 nodes): `User assigned via API should appear in the users tab.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 182`** (1 nodes): `Add user modal should show available users.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 183`** (1 nodes): `Users tab should have From and Until columns for effective dates.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 184`** (1 nodes): `Clean up: remove user from group via API.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 185`** (1 nodes): `Add an AP via the Add AP modal: search, select, click Add.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 186`** (1 nodes): `Remove an AP via the Remove button in the AP table.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (1 nodes): `Add a user via the Add User modal: select checkbox, click Add.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (1 nodes): `Remove a user via the Remove button in the users table.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (1 nodes): `Edit name and description via the edit modal and verify.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (1 nodes): `Create a throwaway group, then delete it via list page dropdown.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (1 nodes): `Database client for direct database testing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (1 nodes): `Set up test data for database isolation testing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (1 nodes): `Set up multiple tenants for isolation testing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `Set up test environment for security testing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (1 nodes): `login.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DM3Client` connect `Community 1` to `Community 9`, `Community 2`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **Why does `SimulatorAPI` connect `Community 0` to `Community 5`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `DeviceDatabase` connect `Community 0` to `Community 17`, `Community 53`, `Community 46`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Are the 159 inferred relationships involving `DM3Client` (e.g. with `Tenant Isolation Test Configuration  Shared fixtures and configuration for tenan` and `Authenticated API client as system admin.`) actually correct?**
  _`DM3Client` has 159 INFERRED edges - model-reasoned connections that need verification._
- **Are the 57 inferred relationships involving `DeviceDatabase` (e.g. with `Tests for the access decision engine.` and `Create a fresh in-memory database.`) actually correct?**
  _`DeviceDatabase` has 57 INFERRED edges - model-reasoned connections that need verification._
- **Are the 50 inferred relationships involving `VirtualDevice` (e.g. with `AccessEngine` and `DeviceDatabase`) actually correct?**
  _`VirtualDevice` has 50 INFERRED edges - model-reasoned connections that need verification._
- **Are the 61 inferred relationships involving `SimulationConfig` (e.g. with `Tests for VirtualDevice (unit tests, no MQTT connection).` and `Configuration loading from YAML files and environment variables.`) actually correct?**
  _`SimulationConfig` has 61 INFERRED edges - model-reasoned connections that need verification._