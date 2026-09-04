// decode_pcm.js
// Simple decoder for 16-bit PCM (s16le, mono) into Float32Array for Web Audio.
//
// This module is intentionally stateless: you can call decodePcm16leToFloat32
// separately for each incoming chunk.

/**
 * Decode 16-bit little-endian PCM (mono) into a Float32Array in [-1, 1].
 *
 * @param {ArrayBuffer | ArrayBufferView} input - Raw PCM bytes (s16le).
 * @returns {Float32Array} - Decoded samples in WebAudio-friendly format.
 */
export function decodePcm16leToFloat32(input) {
  let buffer;
  let byteOffset;
  let byteLength;

  if (input instanceof ArrayBuffer) {
    buffer = input;
    byteOffset = 0;
    byteLength = buffer.byteLength;
  } else if (ArrayBuffer.isView(input)) {
    buffer = input.buffer;
    byteOffset = input.byteOffset;
    byteLength = input.byteLength;
  } else {
    throw new TypeError("decodePcm16leToFloat32: expected ArrayBuffer or TypedArray");
  }

  if ((byteLength & 1) !== 0) {
    // Drop the last odd byte to keep pairs of 16-bit samples.
    byteLength -= 1;
  }

  const view = new DataView(buffer, byteOffset, byteLength);
  const sampleCount = byteLength >> 1; // bytes / 2
  const out = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const s = view.getInt16(i * 2, true); // little-endian
    // Map int16 [-32768, 32767] to float [-1, 1).
    out[i] = s / 32768.0;
  }

  return out;
}
