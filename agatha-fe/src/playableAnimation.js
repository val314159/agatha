import * as THREE from 'three';

export function createAnimationClip(playable) {
  const boneMap = playable.target?.boneMap || {};
  const tracks = (playable.tracks || [])
    .map((track) => {
      const nodeName = boneMap[track.bone];
      if (!nodeName) return null;

      const name = `${nodeName}.${track.property}`;
      if (track.property === 'quaternion') {
        return new THREE.QuaternionKeyframeTrack(name, track.times, track.values);
      }
      if (track.property === 'position') {
        return new THREE.VectorKeyframeTrack(name, track.times, track.values);
      }
      return null;
    })
    .filter(Boolean);

  return new THREE.AnimationClip(playable.name || playable.format || 'animation', playable.duration, tracks);
}

export function collectTrackTimes(tracks = []) {
  const timesSet = new Set();
  for (const track of tracks) {
    for (const t of track.times || []) {
      timesSet.add(t);
    }
  }
  return Array.from(timesSet).sort((a, b) => a - b);
}

export function cloneTracks(tracks = []) {
  return tracks.map((track) => ({
    bone: track.bone,
    property: track.property,
    times: Array.from(track.times || []),
    values: Array.from(track.values || []),
  }));
}

export function cloneTarget(target = {}) {
  return {
    ...target,
    boneMap: { ...(target.boneMap || {}) },
  };
}

export function cloneLocks(locks = []) {
  return locks.map((lock) => ({ ...lock }));
}

export function deriveTiming(times = []) {
  const deltas = [];
  for (let i = 1; i < times.length; i += 1) {
    const delta = times[i] - times[i - 1];
    if (delta > 0) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) {
    return {
      keyframeCount: times.length,
      sampleInterval: 0,
      nominalFrameRate: 0,
      minInterval: 0,
      maxInterval: 0,
    };
  }

  const sampleInterval = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
  return {
    keyframeCount: times.length,
    sampleInterval,
    nominalFrameRate: sampleInterval > 0 ? 1 / sampleInterval : 0,
    minInterval: Math.min(...deltas),
    maxInterval: Math.max(...deltas),
  };
}

export function trackKey(track) {
  return `${track.bone}.${track.property}`;
}
