import { ScanFace, CreditCard, QrCode, KeyRound, FingerprintPattern, IdCard, CarFront, Eye, SmartphoneNfc, type LucideIcon } from 'lucide-react';

// --- Verify methods ---

export type VerifyMethodValue = 'face' | 'nfc' | 'qr' | 'pin' | 'fingerprint' | 'vnid' | 'plate_number' | 'iris' | 'nfc_phone';

export const VERIFY_METHODS: readonly { value: VerifyMethodValue; label: string; icon: LucideIcon }[] = [
  { value: 'face', label: 'Face', icon: ScanFace },
  { value: 'fingerprint', label: 'Fingerprint', icon: FingerprintPattern },
  { value: 'iris', label: 'Iris', icon: Eye },
  { value: 'nfc', label: 'NFC', icon: CreditCard },
  { value: 'nfc_phone', label: 'NFC Phone', icon: SmartphoneNfc },
  { value: 'pin', label: 'PIN', icon: KeyRound },
  { value: 'plate_number', label: 'Plate Number', icon: CarFront },
  { value: 'qr', label: 'QR', icon: QrCode },
  { value: 'vnid', label: 'VNID', icon: IdCard },
];

// --- Per-model capabilities ---

/** Which verify methods each device model supports */
export const MODEL_CAPABILITIES: Record<string, VerifyMethodValue[]> = {
  // Terminal — all methods
  ra08:          ['face', 'nfc', 'qr', 'pin', 'fingerprint', 'vnid', 'plate_number', 'iris', 'nfc_phone'],
  ba8300:        ['face', 'nfc', 'qr', 'pin', 'fingerprint', 'vnid', 'plate_number', 'iris', 'nfc_phone'],
  df970:         ['face', 'nfc', 'qr', 'pin', 'fingerprint', 'vnid', 'plate_number', 'iris', 'nfc_phone'],
  dq200:         ['face', 'nfc', 'qr', 'pin', 'fingerprint', 'vnid', 'plate_number', 'iris', 'nfc_phone'],
  dq8500:        ['face', 'nfc', 'qr', 'pin', 'fingerprint', 'vnid', 'plate_number', 'iris', 'nfc_phone'],
  icu970:        ['face', 'nfc', 'qr', 'pin', 'fingerprint', 'vnid', 'plate_number', 'iris', 'nfc_phone'],
  // Controller — face, nfc, qr, pin
  icu300n:       ['face', 'nfc', 'qr', 'pin'],
  ipopx:         ['face', 'nfc', 'qr', 'pin'],
  itouch_pop_x:  ['face', 'nfc', 'qr', 'pin'],
  icu400:        ['face', 'nfc', 'qr', 'pin'],
  // Camera — face only
  camera_dc:     ['face'],
  cctv:          ['face'],
  // Sensor / Reader — none
  door_sensor:   [],
  de960:         [],
  de950:         [],
};

/** Get supported verify methods for a model. Returns empty array if model not found. */
export function getModelCapabilities(model: string): VerifyMethodValue[] {
  return MODEL_CAPABILITIES[model] ?? [];
}

// --- Device type → models mapping ---

/** Device type → compatible hardware models mapping */
export const DEVICE_TYPE_MODELS: Record<string, { value: string; label: string }[]> = {
  terminal: [
    { value: 'ra08', label: 'RA-08' },
    { value: 'ba8300', label: 'BA-8300' },
    { value: 'df970', label: 'DF-970' },
    { value: 'dq200', label: 'DQ-200' },
    { value: 'dq8500', label: 'DQ-8500' },
    { value: 'icu970', label: 'ICU-970' },
  ],
  controller: [
    { value: 'icu300n', label: 'ICU-300N' },
    { value: 'ipopx', label: 'iPopX' },
    { value: 'itouch_pop_x', label: 'iTouch Pop X' },
    { value: 'icu400', label: 'ICU-400N' },
  ],
  camera: [
    { value: 'camera_dc', label: 'DC-300' },
    { value: 'cctv', label: 'CCTV' },
  ],
  sensor: [
    { value: 'door_sensor', label: 'Door Sensor' },
    { value: 'de960', label: 'DE-960' },
    { value: 'de950', label: 'DE-950' },
  ],
};

/** Flat list of all device models with their type group */
export const ALL_DEVICE_MODELS: { value: string; label: string; type: string }[] =
  Object.entries(DEVICE_TYPE_MODELS).flatMap(([type, models]) =>
    models.map(m => ({ ...m, type }))
  );
