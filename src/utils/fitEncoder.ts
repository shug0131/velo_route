import { RecordedTrackPoint, RideSummary } from '../types/simulator';

const FIT_EPOCH_OFFSET_SEC = 631065600; // Seconds between 1970-01-01 and 1989-12-31T00:00:00Z
const SEMICIRCLES_PER_DEG = 2147483648 / 180; // 2^31 / 180

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

function computeFitCrc(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    const byte = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf];
  }
  return crc & 0xffff;
}

function toFitTimestamp(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000) - FIT_EPOCH_OFFSET_SEC);
}

class FitByteWriter {
  private buf: number[] = [];

  u8(v: number) {
    this.buf.push(v & 0xff);
  }

  u16(v: number) {
    const val = v & 0xffff;
    this.buf.push(val & 0xff, (val >> 8) & 0xff);
  }

  u32(v: number) {
    const val = v >>> 0;
    this.buf.push(
      val & 0xff,
      (val >> 8) & 0xff,
      (val >> 16) & 0xff,
      (val >> 24) & 0xff
    );
  }

  i32(v: number) {
    this.u32(v | 0);
  }

  writeDefinition(
    localMsgType: number,
    globalMsgNum: number,
    fields: Array<[number, number, number]> // [fieldDefNum, sizeBytes, baseType]
  ) {
    this.u8(0x40 | (localMsgType & 0x0f)); // Definition message header
    this.u8(0x00); // Reserved
    this.u8(0x00); // Architecture: Little Endian
    this.u16(globalMsgNum);
    this.u8(fields.length);
    for (const [fNum, fSize, baseType] of fields) {
      this.u8(fNum);
      this.u8(fSize);
      this.u8(baseType);
    }
  }

  writeDataHeader(localMsgType: number) {
    this.u8(localMsgType & 0x0f);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// FIT Base Types
const BASE_ENUM = 0x00;
const BASE_UINT8 = 0x02;
const BASE_SINT32 = 0x85;
const BASE_UINT16 = 0x84;
const BASE_UINT32 = 0x86;
const BASE_UINT32Z = 0x8c;

/**
 * Encodes a completed indoor ride into a binary Garmin/ANT+ FIT Activity file.
 * Includes file_id (0), record (20), lap (19), session (18), and activity (34) messages.
 */
export function encodeRideToFit(
  points: RecordedTrackPoint[],
  summary: RideSummary
): Uint8Array {
  const data = new FitByteWriter();

  const startFitTs = toFitTimestamp(summary.startTimeMs);
  const endFitTs = Math.max(startFitTs + 1, toFitTimestamp(summary.endTimeMs));
  const totalElapsedMs = Math.max(1000, Math.round(summary.elapsedSec * 1000));
  const totalDistCm = Math.max(0, Math.round(summary.totalDistanceMeters * 100));
  const avgSpeedMms = Math.round((summary.avgSpeedKmh / 3.6) * 1000);
  const maxSpeedMms = Math.round((summary.maxSpeedKmh / 3.6) * 1000);
  const avgCadence = Math.min(254, Math.max(0, Math.round(summary.avgCadenceRpm)));
  const avgPower = Math.min(65534, Math.max(0, Math.round(summary.avgWatts)));
  const maxPower = Math.min(65534, Math.max(0, Math.round(summary.maxWatts)));
  const totalAscent = Math.min(65534, Math.max(0, Math.round(summary.elevationGainMeters)));

  // 1. file_id (Global 0, Local 0)
  data.writeDefinition(0, 0, [
    [0, 1, BASE_ENUM], // type = 4 (activity)
    [1, 2, BASE_UINT16], // manufacturer = 32 (Wahoo Fitness)
    [2, 2, BASE_UINT16], // product = 1
    [3, 4, BASE_UINT32Z], // serial_number
    [4, 4, BASE_UINT32], // time_created
  ]);
  data.writeDataHeader(0);
  data.u8(4); // Activity file
  data.u16(32); // Wahoo Fitness
  data.u16(1);
  data.u32(10042026);
  data.u32(startFitTs);

  // 2. record (Global 20, Local 1)
  data.writeDefinition(1, 20, [
    [253, 4, BASE_UINT32], // timestamp
    [0, 4, BASE_SINT32], // position_lat (semicircles)
    [1, 4, BASE_SINT32], // position_long (semicircles)
    [2, 2, BASE_UINT16], // altitude ((m + 500) * 5)
    [4, 1, BASE_UINT8], // cadence (rpm)
    [5, 4, BASE_UINT32], // distance (cm)
    [6, 2, BASE_UINT16], // speed (mm/s)
    [7, 2, BASE_UINT16], // power (watts)
  ]);

  for (const pt of points) {
    data.writeDataHeader(1);
    data.u32(toFitTimestamp(pt.timestampMs));
    data.i32(Math.round(pt.lat * SEMICIRCLES_PER_DEG));
    data.i32(Math.round(pt.lon * SEMICIRCLES_PER_DEG));
    const altScaled = Math.max(0, Math.min(65534, Math.round((pt.elevationMeters + 500) * 5)));
    data.u16(altScaled);
    data.u8(Math.min(254, Math.max(0, Math.round(pt.cadenceRpm))));
    data.u32(Math.max(0, Math.round(pt.distanceMeters * 100)));
    data.u16(Math.max(0, Math.min(65534, Math.round((pt.speedKmh / 3.6) * 1000))));
    data.u16(Math.max(0, Math.min(65534, Math.round(pt.watts))));
  }

  // 3. lap (Global 19, Local 2)
  data.writeDefinition(2, 19, [
    [253, 4, BASE_UINT32], // timestamp
    [2, 4, BASE_UINT32], // start_time
    [7, 4, BASE_UINT32], // total_elapsed_time (ms)
    [8, 4, BASE_UINT32], // total_timer_time (ms)
    [9, 4, BASE_UINT32], // total_distance (cm)
    [13, 2, BASE_UINT16], // avg_speed (mm/s)
    [14, 2, BASE_UINT16], // max_speed (mm/s)
    [17, 1, BASE_UINT8], // avg_cadence
    [19, 2, BASE_UINT16], // avg_power
    [20, 2, BASE_UINT16], // max_power
    [21, 2, BASE_UINT16], // total_ascent (m)
    [25, 1, BASE_ENUM], // sport = 2 (cycling)
  ]);
  data.writeDataHeader(2);
  data.u32(endFitTs);
  data.u32(startFitTs);
  data.u32(totalElapsedMs);
  data.u32(totalElapsedMs);
  data.u32(totalDistCm);
  data.u16(avgSpeedMms);
  data.u16(maxSpeedMms);
  data.u8(avgCadence);
  data.u16(avgPower);
  data.u16(maxPower);
  data.u16(totalAscent);
  data.u8(2);

  // 4. session (Global 18, Local 3)
  data.writeDefinition(3, 18, [
    [253, 4, BASE_UINT32], // timestamp
    [2, 4, BASE_UINT32], // start_time
    [5, 1, BASE_ENUM], // sport = 2 (cycling)
    [6, 1, BASE_ENUM], // sub_sport = 6 (indoor_cycling)
    [7, 4, BASE_UINT32], // total_elapsed_time
    [8, 4, BASE_UINT32], // total_timer_time
    [9, 4, BASE_UINT32], // total_distance
    [14, 2, BASE_UINT16], // avg_speed
    [15, 2, BASE_UINT16], // max_speed
    [18, 1, BASE_UINT8], // avg_cadence
    [20, 2, BASE_UINT16], // avg_power
    [21, 2, BASE_UINT16], // max_power
    [22, 2, BASE_UINT16], // total_ascent
    [25, 2, BASE_UINT16], // first_lap_index
    [26, 2, BASE_UINT16], // num_laps
  ]);
  data.writeDataHeader(3);
  data.u32(endFitTs);
  data.u32(startFitTs);
  data.u8(2); // Cycling
  data.u8(6); // Indoor Cycling
  data.u32(totalElapsedMs);
  data.u32(totalElapsedMs);
  data.u32(totalDistCm);
  data.u16(avgSpeedMms);
  data.u16(maxSpeedMms);
  data.u8(avgCadence);
  data.u16(avgPower);
  data.u16(maxPower);
  data.u16(totalAscent);
  data.u16(0);
  data.u16(1);

  // 5. activity (Global 34, Local 4)
  data.writeDefinition(4, 34, [
    [253, 4, BASE_UINT32], // timestamp
    [0, 4, BASE_UINT32], // total_timer_time
    [1, 2, BASE_UINT16], // num_sessions
    [2, 1, BASE_ENUM], // type = 0 (manual)
    [3, 1, BASE_ENUM], // event = 26 (activity)
    [4, 1, BASE_ENUM], // event_type = 1 (stop)
  ]);
  data.writeDataHeader(4);
  data.u32(endFitTs);
  data.u32(totalElapsedMs);
  data.u16(1);
  data.u8(0);
  data.u8(26);
  data.u8(1);

  const dataBytes = data.toUint8Array();
  const dataSize = dataBytes.length;

  // Assemble 14-byte FIT header + dataBytes + 2-byte trailing CRC
  const output = new Uint8Array(14 + dataSize + 2);
  output[0] = 14; // header size
  output[1] = 0x10; // protocol version 1.0
  output[2] = 2132 & 0xff; // profile version LSB
  output[3] = (2132 >> 8) & 0xff; // profile version MSB
  output[4] = dataSize & 0xff;
  output[5] = (dataSize >> 8) & 0xff;
  output[6] = (dataSize >> 16) & 0xff;
  output[7] = (dataSize >> 24) & 0xff;
  output[8] = 0x2e; // '.'
  output[9] = 0x46; // 'F'
  output[10] = 0x49; // 'I'
  output[11] = 0x54; // 'T'

  const headerCrc = computeFitCrc(output, 0, 12);
  output[12] = headerCrc & 0xff;
  output[13] = (headerCrc >> 8) & 0xff;

  output.set(dataBytes, 14);

  const fileCrc = computeFitCrc(output, 14, 14 + dataSize);
  output[14 + dataSize] = fileCrc & 0xff;
  output[14 + dataSize + 1] = (fileCrc >> 8) & 0xff;

  return output;
}
