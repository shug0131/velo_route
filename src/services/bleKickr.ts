import {
  getBluetoothApi,
  isWebBluetoothSupported,
  WebBleCharacteristic,
  WebBleDevice,
} from './webBluetoothTypes';

const FTMS_SERVICE = 0x1826;
const FTMS_INDOOR_BIKE_DATA = 0x2ad2;
const FTMS_CONTROL_POINT = 0x2ad9;
const CYCLING_POWER_SERVICE = 0x1818;
const CYCLING_POWER_MEASUREMENT = 0x2a63;

export interface KickrCallbacks {
  onTelemetry: (data: { watts?: number; cadenceRpm?: number; trainerSpeedKmh?: number }) => void;
  onStatusChange: (status: {
    connected: boolean;
    connecting: boolean;
    deviceName: string | null;
    controlGranted: boolean;
    lastCommandSummary?: string | null;
    error: string | null;
  }) => void;
}

export class KickrBleClient {
  private device: WebBleDevice | null = null;
  private controlPoint: WebBleCharacteristic | null = null;
  private indoorBikeChar: WebBleCharacteristic | null = null;
  private cyclingPowerChar: WebBleCharacteristic | null = null;
  private callbacks: KickrCallbacks;
  private controlGranted = false;
  private writeQueue: Promise<void> = Promise.resolve();
  private lastCrankRevs: number | null = null;
  private lastCrankTime: number | null = null;
  private lastCommandSentAt = 0;

  constructor(callbacks: KickrCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    if (!isWebBluetoothSupported()) {
      this.callbacks.onStatusChange({
        connected: false,
        connecting: false,
        deviceName: null,
        controlGranted: false,
        error: 'Web Bluetooth requires Chrome, Edge, or Opera over HTTPS.',
      });
      return;
    }

    try {
      this.callbacks.onStatusChange({
        connected: false,
        connecting: true,
        deviceName: null,
        controlGranted: false,
        error: null,
      });

      const ble = getBluetoothApi();
      const device = await ble.requestDevice({
        filters: [
          { services: [FTMS_SERVICE] },
          { services: [CYCLING_POWER_SERVICE] },
          { namePrefix: 'KICKR' },
          { namePrefix: 'Wahoo' },
        ],
        optionalServices: [FTMS_SERVICE, CYCLING_POWER_SERVICE, 0x180a],
      });

      this.device = device;
      device.addEventListener('gattserverdisconnected', this.handleDisconnect);

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to establish GATT connection to trainer.');
      }

      // 1. Try FTMS (Fitness Machine Service 0x1826)
      try {
        const ftms = await server.getPrimaryService(FTMS_SERVICE);
        try {
          this.indoorBikeChar = await ftms.getCharacteristic(FTMS_INDOOR_BIKE_DATA);
          await this.indoorBikeChar.startNotifications();
          this.indoorBikeChar.addEventListener('characteristicvaluechanged', this.handleIndoorBikeData);
        } catch {
          // Some trainers expose Cycling Power without Indoor Bike Data
        }

        try {
          this.controlPoint = await ftms.getCharacteristic(FTMS_CONTROL_POINT);
          await this.controlPoint.startNotifications();
          this.controlPoint.addEventListener('characteristicvaluechanged', this.handleControlPointAck);
          await this.requestControlAndStart();
        } catch {
          this.controlGranted = false;
        }
      } catch {
        // Fallback to Cycling Power Service if FTMS unavailable
      }

      // 2. Also subscribe to Cycling Power Service (0x1818) for reliable cadence & watts
      try {
        const cps = await server.getPrimaryService(CYCLING_POWER_SERVICE);
        this.cyclingPowerChar = await cps.getCharacteristic(CYCLING_POWER_MEASUREMENT);
        await this.cyclingPowerChar.startNotifications();
        this.cyclingPowerChar.addEventListener('characteristicvaluechanged', this.handleCyclingPower);
      } catch {
        // Optional if FTMS Indoor Bike Data already streams watts/cadence
      }

      this.callbacks.onStatusChange({
        connected: true,
        connecting: false,
        deviceName: device.name || 'Wahoo KICKR',
        controlGranted: this.controlGranted,
        lastCommandSummary: this.controlGranted ? 'FTMS Control Active' : 'Telemetry Read-Only',
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bluetooth connection cancelled.';
      this.callbacks.onStatusChange({
        connected: false,
        connecting: false,
        deviceName: null,
        controlGranted: false,
        error: message.includes('User cancelled') ? null : message,
      });
    }
  }

  private handleDisconnect = () => {
    this.cleanupListeners();
    this.controlGranted = false;
    this.callbacks.onStatusChange({
      connected: false,
      connecting: false,
      deviceName: null,
      controlGranted: false,
      error: 'Wahoo KICKR disconnected.',
    });
  };

  private cleanupListeners() {
    if (this.indoorBikeChar) {
      this.indoorBikeChar.removeEventListener('characteristicvaluechanged', this.handleIndoorBikeData);
      this.indoorBikeChar = null;
    }
    if (this.controlPoint) {
      this.controlPoint.removeEventListener('characteristicvaluechanged', this.handleControlPointAck);
      this.controlPoint = null;
    }
    if (this.cyclingPowerChar) {
      this.cyclingPowerChar.removeEventListener('characteristicvaluechanged', this.handleCyclingPower);
      this.cyclingPowerChar = null;
    }
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
    this.controlGranted = false;
    this.callbacks.onStatusChange({
      connected: false,
      connecting: false,
      deviceName: null,
      controlGranted: false,
      lastCommandSummary: null,
      error: null,
    });
  }

  private enqueueWrite(fn: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(fn).catch((err) => {
      console.warn('KICKR BLE write error:', err);
    });
    return this.writeQueue;
  }

  private async writeControlPoint(buffer: ArrayBuffer | Uint8Array<ArrayBuffer>) {
    if (!this.controlPoint) return;
    if (typeof this.controlPoint.writeValueWithResponse === 'function') {
      await this.controlPoint.writeValueWithResponse(buffer);
    } else {
      await this.controlPoint.writeValue(buffer);
    }
  }

  private async requestControlAndStart() {
    if (!this.controlPoint) return;
    await this.enqueueWrite(async () => {
      await this.writeControlPoint(new Uint8Array([0x00])); // Request Control
      await this.writeControlPoint(new Uint8Array([0x07])); // Start / Resume
      this.controlGranted = true;
    });
  }

  async setSimulationGrade(gradePercent: number, crr = 0.004, cwa = 0.32): Promise<void> {
    if (!this.controlPoint || !this.device?.gatt?.connected) return;
    const now = performance.now();
    if (now - this.lastCommandSentAt < 250) return; // Rate-limit BLE writes to <= 4Hz
    this.lastCommandSentAt = now;

    const clampedGrade = Math.max(-20, Math.min(20, gradePercent));
    const gradeRaw = Math.round(clampedGrade * 100); // 0.01% resolution sint16
    const crrRaw = Math.max(0, Math.min(255, Math.round(crr / 0.0001))); // 0.0001 resolution uint8
    const cwRaw = Math.max(0, Math.min(255, Math.round(cwa / 0.01))); // 0.01 kg/m resolution uint8

    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    view.setUint8(0, 0x11); // Set Indoor Bike Simulation Parameters
    view.setInt16(1, 0, true); // Wind speed 0 m/s
    view.setInt16(3, gradeRaw, true); // Grade
    view.setUint8(5, crrRaw);
    view.setUint8(6, cwRaw);

    await this.enqueueWrite(async () => {
      if (!this.controlGranted) {
        await this.writeControlPoint(new Uint8Array([0x00]));
        await this.writeControlPoint(new Uint8Array([0x07]));
        this.controlGranted = true;
      }
      await this.writeControlPoint(buffer);
    });

    this.callbacks.onStatusChange({
      connected: true,
      connecting: false,
      deviceName: this.device?.name || 'Wahoo KICKR',
      controlGranted: this.controlGranted,
      lastCommandSummary: `SIM Grade ${clampedGrade >= 0 ? '+' : ''}${clampedGrade.toFixed(1)}%`,
      error: null,
    });
  }

  async setErgTargetPower(watts: number): Promise<void> {
    if (!this.controlPoint || !this.device?.gatt?.connected) return;
    const now = performance.now();
    if (now - this.lastCommandSentAt < 250) return;
    this.lastCommandSentAt = now;

    const clampedWatts = Math.max(30, Math.min(2000, Math.round(watts)));
    const buffer = new ArrayBuffer(3);
    const view = new DataView(buffer);
    view.setUint8(0, 0x05); // Set Target Power
    view.setUint16(1, clampedWatts, true);

    await this.enqueueWrite(async () => {
      if (!this.controlGranted) {
        await this.writeControlPoint(new Uint8Array([0x00]));
        await this.writeControlPoint(new Uint8Array([0x07]));
        this.controlGranted = true;
      }
      await this.writeControlPoint(buffer);
    });

    this.callbacks.onStatusChange({
      connected: true,
      connecting: false,
      deviceName: this.device?.name || 'Wahoo KICKR',
      controlGranted: this.controlGranted,
      lastCommandSummary: `ERG Target ${clampedWatts} W`,
      error: null,
    });
  }

  private handleControlPointAck = (event: Event) => {
    const char = event.target as unknown as WebBleCharacteristic;
    const view = char.value;
    if (!view || view.byteLength < 3) return;
    const opCode = view.getUint8(0);
    const reqOpCode = view.getUint8(1);
    const result = view.getUint8(2);
    if (opCode === 0x80 && reqOpCode === 0x00) {
      this.controlGranted = result === 0x01;
    }
  };

  /**
   * Parses FTMS Indoor Bike Data (0x2AD2) per Bluetooth SIG specification.
   */
  private handleIndoorBikeData = (event: Event) => {
    const char = event.target as unknown as WebBleCharacteristic;
    const view = char.value;
    if (!view || view.byteLength < 2) return;

    const flags = view.getUint16(0, true);
    let offset = 2;

    let trainerSpeedKmh: number | undefined;
    let cadenceRpm: number | undefined;
    let watts: number | undefined;

    // Bit 0 == 0 means Instantaneous Speed is present (uint16, 0.01 km/h)
    if ((flags & 0x0001) === 0 && offset + 2 <= view.byteLength) {
      trainerSpeedKmh = view.getUint16(offset, true) * 0.01;
      offset += 2;
    }
    // Bit 1: Average Speed present
    if ((flags & 0x0002) !== 0 && offset + 2 <= view.byteLength) {
      offset += 2;
    }
    // Bit 2: Instantaneous Cadence present (uint16, 0.5 rpm)
    if ((flags & 0x0004) !== 0 && offset + 2 <= view.byteLength) {
      cadenceRpm = Math.round(view.getUint16(offset, true) * 0.5);
      offset += 2;
    }
    // Bit 3: Average Cadence present
    if ((flags & 0x0008) !== 0 && offset + 2 <= view.byteLength) {
      offset += 2;
    }
    // Bit 4: Total Distance present (uint24)
    if ((flags & 0x0010) !== 0 && offset + 3 <= view.byteLength) {
      offset += 3;
    }
    // Bit 5: Resistance Level present (sint16)
    if ((flags & 0x0020) !== 0 && offset + 2 <= view.byteLength) {
      offset += 2;
    }
    // Bit 6: Instantaneous Power present (sint16, 1W)
    if ((flags & 0x0040) !== 0 && offset + 2 <= view.byteLength) {
      watts = Math.max(0, view.getInt16(offset, true));
      offset += 2;
    }

    this.callbacks.onTelemetry({ watts, cadenceRpm, trainerSpeedKmh });
  };

  /**
   * Parses Cycling Power Measurement (0x2A63) for power and crank-revolution cadence.
   */
  private handleCyclingPower = (event: Event) => {
    const char = event.target as unknown as WebBleCharacteristic;
    const view = char.value;
    if (!view || view.byteLength < 4) return;

    const flags = view.getUint16(0, true);
    const watts = Math.max(0, view.getInt16(2, true));
    let offset = 4;

    if (flags & 0x0001) offset += 1; // Pedal Power Balance
    if (flags & 0x0004) offset += 2; // Accumulated Torque
    if (flags & 0x0010) offset += 6; // Wheel Revolution Data

    let cadenceRpm: number | undefined;
    if ((flags & 0x0020) !== 0 && offset + 4 <= view.byteLength) {
      const crankRevs = view.getUint16(offset, true);
      const crankEventTime = view.getUint16(offset + 2, true); // 1/1024 sec

      if (this.lastCrankRevs !== null && this.lastCrankTime !== null) {
        const deltaRevs = (crankRevs - this.lastCrankRevs + 65536) % 65536;
        const deltaTimeTicks = (crankEventTime - this.lastCrankTime + 65536) % 65536;
        if (deltaRevs > 0 && deltaTimeTicks > 0) {
          const seconds = deltaTimeTicks / 1024;
          const computed = Math.round((deltaRevs / seconds) * 60);
          if (computed >= 10 && computed <= 220) {
            cadenceRpm = computed;
          }
        } else if (deltaRevs === 0) {
          cadenceRpm = 0;
        }
      }
      this.lastCrankRevs = crankRevs;
      this.lastCrankTime = crankEventTime;
    }

    this.callbacks.onTelemetry({ watts, cadenceRpm });
  };
}
