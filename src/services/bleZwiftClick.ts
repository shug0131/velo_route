import {
  getBluetoothApi,
  isWebBluetoothSupported,
  WebBleCharacteristic,
  WebBleDevice,
} from './webBluetoothTypes';

// Classic & v2 Zwift Race Controller BLE UUIDs
const ZWIFT_CUSTOM_SERVICE_128 = '00000001-19ca-4651-86e5-fa29dcdd09d1';
const ZWIFT_MEASUREMENT_CHAR_128 = '00000002-19ca-4651-86e5-fa29dcdd09d1';
const ZWIFT_CONTROL_POINT_128 = '00000003-19ca-4651-86e5-fa29dcdd09d1';
const ZWIFT_RESPONSE_CHAR_128 = '00000004-19ca-4651-86e5-fa29dcdd09d1';

// 16-bit FC82 service used on newer Zwift Click v2 / Zwift Ride firmware
const ZWIFT_FC82_SERVICE = 0xfc82;
const BATTERY_SERVICE = 0x180f;
const BATTERY_LEVEL_CHAR = 0x2a19;

export interface ZwiftClickCallbacks {
  onShift: (direction: 'up' | 'down') => void;
  onStatusChange: (status: {
    connected: boolean;
    connecting: boolean;
    deviceName: string | null;
    batteryPercent: number | null;
    handshakeComplete: boolean;
    lastButtonPressed?: 'up' | 'down' | null;
    lastPacketHex?: string | null;
    learnMode?: 'up' | 'down' | null;
    customUpSignature?: string | null;
    customDownSignature?: string | null;
    error: string | null;
  }) => void;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

export class ZwiftClickBleClient {
  private device: WebBleDevice | null = null;
  private notifyChars: WebBleCharacteristic[] = [];
  private callbacks: ZwiftClickCallbacks;
  private handshakeComplete = false;
  private batteryPercent: number | null = null;
  private prevUpActive = false;
  private prevDownActive = false;
  private learnMode: 'up' | 'down' | null = null;
  private customUpSignature: string | null = null;
  private customDownSignature: string | null = null;
  private lastIdleHex: string | null = null;
  private lastShiftAt = 0;

  constructor(callbacks: ZwiftClickCallbacks) {
    this.callbacks = callbacks;
    try {
      this.customUpSignature = localStorage.getItem('veloroute_click_up_sig');
      this.customDownSignature = localStorage.getItem('veloroute_click_down_sig');
    } catch {
      // ignore storage errors
    }
  }

  setLearnMode(mode: 'up' | 'down' | null) {
    this.learnMode = mode;
    this.emitStatus();
  }

  clearCustomSignatures() {
    this.customUpSignature = null;
    this.customDownSignature = null;
    try {
      localStorage.removeItem('veloroute_click_up_sig');
      localStorage.removeItem('veloroute_click_down_sig');
    } catch {
      // ignore
    }
    this.emitStatus();
  }

  async connect(): Promise<void> {
    if (!isWebBluetoothSupported()) {
      this.callbacks.onStatusChange({
        connected: false,
        connecting: false,
        deviceName: null,
        batteryPercent: null,
        handshakeComplete: false,
        error: 'Web Bluetooth requires Chrome, Edge, or Opera over HTTPS.',
      });
      return;
    }

    try {
      this.callbacks.onStatusChange({
        connected: false,
        connecting: true,
        deviceName: null,
        batteryPercent: null,
        handshakeComplete: false,
        error: null,
      });

      const ble = getBluetoothApi();
      const device = await ble.requestDevice({
        filters: [
          { namePrefix: 'Zwift Click' },
          { namePrefix: 'Zwift Play' },
          { namePrefix: 'Zwift' },
          { services: [ZWIFT_CUSTOM_SERVICE_128] },
          { services: [ZWIFT_FC82_SERVICE] },
        ],
        optionalServices: [ZWIFT_CUSTOM_SERVICE_128, ZWIFT_FC82_SERVICE, BATTERY_SERVICE, 0x180a],
      });

      this.device = device;
      device.addEventListener('gattserverdisconnected', this.handleDisconnect);

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to Zwift Click GATT server.');
      }

      // Read Battery Level if available
      try {
        const batterySvc = await server.getPrimaryService(BATTERY_SERVICE);
        const batteryChar = await batterySvc.getCharacteristic(BATTERY_LEVEL_CHAR);
        const val = await batteryChar.readValue();
        if (val.byteLength >= 1) {
          this.batteryPercent = val.getUint8(0);
        }
      } catch {
        this.batteryPercent = null;
      }

      // Discover Zwift Controller Service (128-bit or FC82)
      let serviceFound = false;
      for (const svcUuid of [ZWIFT_FC82_SERVICE, ZWIFT_CUSTOM_SERVICE_128]) {
        try {
          const svc = await server.getPrimaryService(svcUuid);
          serviceFound = true;
          const chars = await svc.getCharacteristics();

          // Subscribe to all notify/indicate characteristics
          for (const ch of chars) {
            if (
              ch.uuid === ZWIFT_MEASUREMENT_CHAR_128 ||
              ch.uuid === ZWIFT_RESPONSE_CHAR_128 ||
              ch.uuid.includes('0002') ||
              ch.uuid.includes('0004') ||
              ch.uuid.includes('fc82')
            ) {
              try {
                await ch.startNotifications();
                ch.addEventListener('characteristicvaluechanged', this.handleNotification);
                this.notifyChars.push(ch);
              } catch {
                // Characteristic may not support notify
              }
            }
          }

          // Perform "RideOn" handshake on control point (0003)
          const rideOnBytes = new TextEncoder().encode('RideOn');
          const ctrlChar =
            chars.find((c) => c.uuid === ZWIFT_CONTROL_POINT_128 || c.uuid.includes('0003')) || null;

          if (ctrlChar) {
            try {
              if (typeof ctrlChar.writeValueWithoutResponse === 'function') {
                await ctrlChar.writeValueWithoutResponse(rideOnBytes);
              } else {
                await ctrlChar.writeValue(rideOnBytes);
              }
              this.handshakeComplete = true;
            } catch {
              try {
                await ctrlChar.writeValueWithResponse(rideOnBytes);
                this.handshakeComplete = true;
              } catch {
                // Some Click v2 firmwares stream immediately without RideOn write
              }
            }
          }
          break;
        } catch {
          // Try next service UUID
        }
      }

      if (!serviceFound) {
        throw new Error('Zwift Click controller service not found on this device.');
      }

      this.emitStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bluetooth connection cancelled.';
      this.callbacks.onStatusChange({
        connected: false,
        connecting: false,
        deviceName: null,
        batteryPercent: null,
        handshakeComplete: false,
        error: message.includes('User cancelled') ? null : message,
      });
    }
  }

  private emitStatus(lastButtonPressed: 'up' | 'down' | null = null, lastPacketHex: string | null = null) {
    this.callbacks.onStatusChange({
      connected: Boolean(this.device?.gatt?.connected),
      connecting: false,
      deviceName: this.device?.name || 'Zwift Click v2',
      batteryPercent: this.batteryPercent,
      handshakeComplete: this.handshakeComplete,
      lastButtonPressed,
      lastPacketHex,
      learnMode: this.learnMode,
      customUpSignature: this.customUpSignature,
      customDownSignature: this.customDownSignature,
      error: null,
    });
  }

  private handleDisconnect = () => {
    this.cleanupListeners();
    this.handshakeComplete = false;
    this.callbacks.onStatusChange({
      connected: false,
      connecting: false,
      deviceName: null,
      batteryPercent: null,
      handshakeComplete: false,
      error: 'Zwift Click v2 disconnected.',
    });
  };

  private cleanupListeners() {
    for (const ch of this.notifyChars) {
      ch.removeEventListener('characteristicvaluechanged', this.handleNotification);
    }
    this.notifyChars = [];
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    }
  }

  disconnect() {
    this.cleanupListeners();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.handshakeComplete = false;
    this.callbacks.onStatusChange({
      connected: false,
      connecting: false,
      deviceName: null,
      batteryPercent: null,
      handshakeComplete: false,
      error: null,
    });
  }

  private handleNotification = (event: Event) => {
    const char = event.target as unknown as WebBleCharacteristic;
    const view = char.value;
    if (!view || view.byteLength === 0) return;

    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const hex = bytesToHex(bytes);

    // Check for RideOn handshake echo
    if (bytes.length >= 6) {
      const ascii = String.fromCharCode(...bytes.slice(0, 6));
      if (ascii === 'RideOn') {
        this.handshakeComplete = true;
        this.emitStatus(null, hex);
        return;
      }
    }

    // Ignore periodic keepalive / idle battery packets (0x19 / 0x15)
    if (bytes[0] === 0x19 || bytes[0] === 0x15) {
      this.lastIdleHex = hex;
      return;
    }

    // Support user-learned custom button signatures (handles any Click v2 firmware revision)
    if (this.learnMode) {
      // Ignore pure idle packets that repeat
      if (hex !== this.lastIdleHex && bytes.length >= 2) {
        if (this.learnMode === 'up') {
          this.customUpSignature = hex;
          try {
            localStorage.setItem('veloroute_click_up_sig', hex);
          } catch {
            // ignore
          }
          this.learnMode = null;
          this.emitStatus('up', hex);
          return;
        }
        if (this.learnMode === 'down') {
          this.customDownSignature = hex;
          try {
            localStorage.setItem('veloroute_click_down_sig', hex);
          } catch {
            // ignore
          }
          this.learnMode = null;
          this.emitStatus('down', hex);
          return;
        }
      }
    }

    if (this.customUpSignature && hex === this.customUpSignature) {
      this.triggerShift('up', hex);
      return;
    }
    if (this.customDownSignature && hex === this.customDownSignature) {
      this.triggerShift('down', hex);
      return;
    }

    // Standard Zwift Click / Click v2 / Play protobuf button decoding
    // Opcode 0x23 (Click button bitmap / protobuf) or 0x07 (Play/Click v2 keypad status)
    let upPressed = false;
    let downPressed = false;

    if (bytes[0] === 0x23 || bytes[0] === 0x07 || bytes[0] === 0x37) {
      // Scan protobuf field tags: tag 0x08 (field 1 varint: + / up), tag 0x10 (field 2 varint: - / down)
      // In Zwift Click protobuf, pressed = 0, released = 1 (active-low) OR bitmask in Click v2
      for (let i = 1; i < bytes.length - 1; i++) {
        if (bytes[i] === 0x08 && bytes[i + 1] === 0x00) {
          upPressed = true;
        }
        if (bytes[i] === 0x10 && bytes[i + 1] === 0x00) {
          downPressed = true;
        }
      }

      // Click v2 / Zwift Ride compact bitmask fallback when 0x08 0x01 / 0x10 0x01 active-high
      if (!upPressed && !downPressed && bytes.length <= 6) {
        if (bytes[0] === 0x23 && bytes.length >= 3) {
          // Field 1 active-high check
          if (bytes[1] === 0x08 && bytes[2] === 0x01) upPressed = true;
          if (bytes[1] === 0x10 && bytes[2] === 0x01) downPressed = true;
        }
      }
    }

    // Edge-trigger debounce so holding button only shifts once per press
    if (upPressed && !this.prevUpActive) {
      this.triggerShift('up', hex);
    } else if (downPressed && !this.prevDownActive) {
      this.triggerShift('down', hex);
    } else {
      this.emitStatus(null, hex);
    }

    this.prevUpActive = upPressed;
    this.prevDownActive = downPressed;
  };

  private triggerShift(direction: 'up' | 'down', hex: string) {
    const now = performance.now();
    if (now - this.lastShiftAt < 140) return;
    this.lastShiftAt = now;
    this.callbacks.onShift(direction);
    this.emitStatus(direction, hex);
  }
}
