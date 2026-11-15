export interface WebBleCharacteristic {
  uuid: string;
  value?: DataView;
  startNotifications(): Promise<WebBleCharacteristic>;
  stopNotifications(): Promise<WebBleCharacteristic>;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface WebBleService {
  uuid: string;
  getCharacteristic(characteristic: string | number): Promise<WebBleCharacteristic>;
  getCharacteristics(): Promise<WebBleCharacteristic[]>;
}

export interface WebBleGattServer {
  connected: boolean;
  connect(): Promise<WebBleGattServer>;
  disconnect(): void;
  getPrimaryService(service: string | number): Promise<WebBleService>;
  getPrimaryServices(): Promise<WebBleService[]>;
}

export interface WebBleDevice {
  id: string;
  name?: string;
  gatt?: WebBleGattServer;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface WebBluetoothNavigator {
  bluetooth?: {
    requestDevice(options: {
      filters?: Array<{
        services?: Array<string | number>;
        name?: string;
        namePrefix?: string;
      }>;
      optionalServices?: Array<string | number>;
      acceptAllDevices?: boolean;
    }): Promise<WebBleDevice>;
  };
}

export function isWebBluetoothSupported(): boolean {
  const nav = navigator as unknown as WebBluetoothNavigator;
  return typeof navigator !== 'undefined' && Boolean(nav.bluetooth);
}

export function getBluetoothApi() {
  const nav = navigator as unknown as WebBluetoothNavigator;
  if (!nav.bluetooth) {
    throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge over HTTPS.');
  }
  return nav.bluetooth;
}
