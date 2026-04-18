# DF-970 Android Terminal App — UI Screen Description

**Product:** Duall Pass DF-970 Access Control Terminal  
**Platform:** Android  
**Design Style:** Dark theme, glassmorphism accents, Inter font family  
**Resolution:** 480 × 800px  

---

## Authentication Flow

### 1. Idle Screen (`01-idle.png`, `01-home.png`)
- Default screen when no user interaction
- Shows **Duall Pass** branding with logo
- Large clock display (time & date)
- Quick-access buttons: Face, QR Code, PIN, NFC
- Status bar: connection status, WiFi, battery

### 2. Ready / Camera Ready (`02-scanning.png`, `02-cam-ready.png`)
- Camera activates, live preview shown
- Prompt: "Stay forward to check in"
- Face detection overlay with guide frame

### 3. Face Scanning (`03-cam-face-scan.png`, `03-cam-scanning.png`)
- Active face recognition in progress
- Green scanning frame around detected face
- "Verifying identity..." status

### 4. Access Granted (`03-granted.png`, `04-cam-face-granted.png`, `04-cam-granted.png`)
- ✅ Green success indicator
- User name displayed (e.g., "Cuong Nguyen")
- User photo and company info
- Auto-returns to idle after timeout

### 5. Access Denied (`04-denied.png`, `05-cam-denied.png`, `05-cam-face-denied.png`)
- ❌ Red denial indicator
- "Access Denied" message
- Reason displayed (unregistered face, expired access, etc.)

### 6. QR Code Scan (`06-cam-qr-scan.png`)
- Camera mode for QR code scanning
- QR scan overlay with guide corners

### 7. QR Granted (`07-cam-qr-granted.png`)
- QR code verified, access granted
- Shows user info from QR credential

### 8. NFC Granted (`08-cam-nfc-granted.png`)
- NFC/card tap verified, access granted

---

## PIN Entry Flow

### 9. PIN Input (`05-pin.png`, `06-pin.png`, `08-pin.png`, `09-pin.png`)
- "Enter PIN Code" prompt
- Numeric keypad (0-9)
- PIN dots for entered digits
- Backspace and confirm buttons

---

## NFC Flow

### 10. NFC Tap (`06-nfc.png`, `07-nfc.png`, `09-nfc.png`, `10-nfc-standalone.png`)
- NFC card icon with animation
- "Tap your card or phone" instruction
- "Hold near the reader for 1-2 seconds" hint

---

## Settings Screens

### 11. Settings Menu (`07-settings.png`, `08-settings.png`, `11-settings-menu.png`)
- Device status overview (users synced count, capacity)
- Menu items:
  - 🔧 Device Configuration
  - 👤 Face Recognition
  - 👥 User Management
  - 🔒 Access Logic
  - 🔄 Sync Database
  - ↩️ Back to Authentication

### 12. Device Configuration (`10-settings.png`, `11-settings.png`, `12-settings-device.png`)
- **Device Identity:** Device ID, Device Name, Serial No., Firmware
- **Server Connection:** Server URL, Status (Connected/Disconnected), Last Sync
- **General:** Volume, Brightness, Language, Time Zone

### 13. Face Recognition Settings (`13-settings-face.png`)
- Recognition settings:
  - Match Threshold
  - Liveness Detection (Enabled/Disabled)
  - IR Anti-Spoofing
  - Max Distance
  - Recognition Speed
- Camera settings:
  - Resolution, IR Camera, Night Mode
- Anti-spoofing: Auto/Enabled

### 14. User Management (`14-settings-users.png`)
- List of enrolled users with avatars
- User count and sync status
- Search/filter functionality

---

## Enrollment Flow

### 15. Enrollment (`08-enrollment.png` → `15-enrollment.png`)
- Step-by-step face enrollment process
- User list showing enrolled members
- "Enrolling Face" screen with live camera
- Progress indicator: "Hold still 1-3 seconds, looking straight"
- Completion confirmation

---

## Design Principles

- **Dark UI** optimized for indoor/outdoor terminal visibility
- **Large touch targets** for gloved or quick-tap usage
- **High contrast** text and icons for readability
- **Minimal steps** — authentication in 1-2 seconds
- **Status feedback** — clear granted/denied visual + color coding (green/red)
- **Glassmorphism** elements for modern aesthetic while maintaining clarity

---

*Designed for Duall Pass DF-970 by Duali Việt Nam*
