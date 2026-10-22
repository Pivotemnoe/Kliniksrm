const storageKey = 'temichevvet.queue.workstation-device-id.v1';

export function getQueueWorkstationDeviceId() {
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  // randomUUID is unavailable on the clinic's plain HTTP LAN address.
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  window.localStorage.setItem(storageKey, id);
  return id;
}
