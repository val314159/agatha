import * as THREE from 'three';
import {
  cloneLocks,
  cloneTarget,
  cloneTracks,
  collectTrackTimes,
  createAnimationClip,
  deriveTiming,
} from './playableAnimation.js';

const PLANT_HEIGHT_THRESHOLD = 0.05;
const PLANT_VELOCITY_THRESHOLD = 0.02;
const FLOOR_HEIGHT = 0;
const FLOOR_EPSILON = 1e-4;

const CONTACT_CHAINS = {
  leftFoot: { chainName: 'leftLeg', endBone: 'leftFoot' },
  rightFoot: { chainName: 'rightLeg', endBone: 'rightFoot' },
  leftToes: { chainName: 'leftLeg', endBone: 'leftToes', fallbackBone: 'leftFoot' },
  rightToes: { chainName: 'rightLeg', endBone: 'rightToes', fallbackBone: 'rightFoot' },
};

export class AvarToAvay {
  constructor(vrm, options = {}) {
    this.vrm = vrm || null;
    this.explicitGroundHeight = options.groundHeight;
    this.plantHeightThreshold = options.plantHeightThreshold ?? PLANT_HEIGHT_THRESHOLD;
    this.plantVelocityThreshold = options.plantVelocityThreshold ?? PLANT_VELOCITY_THRESHOLD;
  }

  bake(avar) {
    if (!avar?.tracks?.length) return null;

    const times = collectTrackTimes(avar.tracks);
    const timing = deriveTiming(times);
    const analysis = this.analyze(avar, times, timing);

    return {
      format: 'avay',
      version: '1.0',
      basis: 'analyzed',
      name: avar.name,
      source: avar.source,
      sourceFormat: avar.format,
      target: cloneTarget(avar.target),
      sourceUnitScale: avar.sourceUnitScale,
      sourceHipsHeight: avar.sourceHipsHeight,
      targetHipsHeight: avar.targetHipsHeight,
      positionScale: avar.positionScale,
      duration: avar.duration,
      tracks: cloneTracks(avar.tracks),
      locks: cloneLocks(avar.locks || []),
      analysis,
    };
  }

  analyze(avar, times, timing) {
    const analysis = {
      timing,
      tracks: analyzeTracks(avar.tracks),
      hips: analyzeHipMotion(avar.tracks),
      thresholds: {
        plantHeight: this.plantHeightThreshold,
        plantVelocity: this.plantVelocityThreshold,
      },
      floor: {
        configuredHeight: this.explicitGroundHeight ?? FLOOR_HEIGHT,
        estimatedHeight: this.explicitGroundHeight ?? FLOOR_HEIGHT,
        minSampleHeight: null,
        minFootHeight: null,
        minVisualHeight: null,
        clearance: null,
        penetrationDepth: 0,
        belowFloorSamples: 0,
      },
      feet: {},
      bounds: null,
      groundHeight: this.explicitGroundHeight ?? FLOOR_HEIGHT,
      contacts: [],
      footSamples: [],
    };

    if (!this.vrm || times.length === 0) {
      return analysis;
    }

    const locks = this.getContactLocks(avar.locks || []);
    if (locks.length === 0) {
      return analysis;
    }

    const motionSamples = this.sampleMotion(avar, times, locks);
    const rawSamples = motionSamples.footSamples;
    const boundsSamples = motionSamples.boundsSamples;
    if (rawSamples.length === 0 && boundsSamples.length === 0) {
      return analysis;
    }

    const configuredFloor = this.explicitGroundHeight ?? FLOOR_HEIGHT;
    const plantedSamples = rawSamples.filter((sample) => sample.planted);
    const minFootHeight = plantedSamples.length > 0
      ? Math.min(...plantedSamples.map((sample) => sample.position[1]))
      : null;
    const minVisualHeight = boundsSamples.length > 0
      ? Math.min(...boundsSamples.map((sample) => sample.min[1]))
      : null;
    const contactBaselines = getContactBaselines(plantedSamples);
    const minSampleHeight = Math.min(
      ...[minFootHeight, minVisualHeight].filter(Number.isFinite)
    );
    const groundHeight = this.explicitGroundHeight ?? minFootHeight ?? minSampleHeight;
    const footSamples = rawSamples.map((sample) => {
      const contactGround = sample.planted
        ? contactBaselines[sample.bone] ?? groundHeight
        : groundHeight;
      const height = sample.position[1] - contactGround;
      const nearGround = Math.abs(height) < this.plantHeightThreshold;
      const slow = !Number.isFinite(sample.velocity) || sample.velocity < this.plantVelocityThreshold;
      return {
        ...sample,
        contactGround,
        height,
        floorClearance: sample.position[1] - configuredFloor,
        nearGround,
        slow,
        contact: sample.planted && nearGround && slow,
      };
    });

    analysis.floor = {
      configuredHeight: configuredFloor,
      estimatedHeight: groundHeight,
      minSampleHeight,
      minFootHeight,
      minVisualHeight,
      clearance: minSampleHeight - configuredFloor,
      penetrationDepth: getPenetrationDepth(minSampleHeight, configuredFloor),
      belowFloorSamples: (
        footSamples.filter((sample) => isBelowFloor(sample.position[1], configuredFloor)).length +
        boundsSamples.filter((sample) => isBelowFloor(sample.min[1], configuredFloor)).length
      ),
    };
    analysis.feet = summarizeFootSamples(footSamples, configuredFloor);
    analysis.bounds = summarizeBoundsSamples(boundsSamples, configuredFloor);
    analysis.groundHeight = groundHeight;
    analysis.footSamples = footSamples;
    analysis.contacts = this.buildContacts(footSamples);
    return analysis;
  }

  getContactLocks(locks) {
    return locks
      .map((lock) => {
        const contact = CONTACT_CHAINS[lock.bone];
        if (!contact) return null;
        return {
          bone: lock.bone,
          planted: lock.planted !== false,
          ...contact,
        };
      })
      .filter(Boolean);
  }

  sampleMotion(avar, times, locks) {
    const clip = createAnimationClip(avar);
    const mixer = new THREE.AnimationMixer(this.vrm.scene);
    const action = mixer.clipAction(clip);
    const previous = new Map();
    const footSamples = [];
    const boundsSamples = [];

    action.play();

    for (const time of times) {
      mixer.setTime(time);
      this.vrm.update?.(0);
      this.vrm.scene.updateWorldMatrix(true, true);

      for (const lock of locks) {
        const node = (
          this.vrm.humanoid?.getNormalizedBoneNode(lock.endBone) ||
          this.vrm.humanoid?.getNormalizedBoneNode(lock.fallbackBone)
        );
        if (!node) continue;

        const position = node.getWorldPosition(new THREE.Vector3());
        const prev = previous.get(lock.bone);
        const dt = prev ? time - prev.time : 0;
        const velocity = prev && dt > 0 ? position.distanceTo(prev.position) / dt : Infinity;

        footSamples.push({
          bone: lock.bone,
          chainName: lock.chainName,
          endBone: lock.endBone,
          planted: lock.planted,
          time,
          position: position.toArray(),
          velocity,
        });
        previous.set(lock.bone, { time, position: position.clone() });
      }

      const box = new THREE.Box3().setFromObject(this.vrm.scene);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        boundsSamples.push({
          time,
          min: box.min.toArray(),
          max: box.max.toArray(),
          size: size.toArray(),
        });
      }
    }

    mixer.setTime(0);
    action.stop();
    mixer.stopAllAction();
    return { footSamples, boundsSamples };
  }

  buildContacts(samples) {
    const byBone = new Map();
    for (const sample of samples) {
      if (!byBone.has(sample.bone)) {
        byBone.set(sample.bone, []);
      }
      byBone.get(sample.bone).push(sample);
    }

    const contacts = [];
    for (const [bone, boneSamples] of byBone) {
      let active = null;
      let lastActiveSample = null;

      for (const sample of boneSamples) {
        if (sample.contact) {
          if (!active) {
            const anchor = sample.position.slice();
            anchor[1] = sample.contactGround;
            active = {
              bone,
              chainName: sample.chainName,
              endBone: sample.endBone,
              start: sample.time,
              endTime: sample.time,
              anchor,
              sampleCount: 0,
              minHeight: Infinity,
              maxHeight: -Infinity,
              averageVelocity: 0,
            };
          }

          active.endTime = sample.time;
          active.sampleCount += 1;
          active.minHeight = Math.min(active.minHeight, sample.height);
          active.maxHeight = Math.max(active.maxHeight, sample.height);
          if (Number.isFinite(sample.velocity)) {
            active.averageVelocity += sample.velocity;
          }
          lastActiveSample = sample;
        } else if (active) {
          contacts.push(finalizeContact(active, lastActiveSample));
          active = null;
          lastActiveSample = null;
        }
      }

      if (active) {
        contacts.push(finalizeContact(active, lastActiveSample));
      }
    }

    return contacts;
  }
}

function analyzeTracks(tracks) {
  const bones = new Set();
  const properties = new Map();
  let positionTracks = 0;
  let quaternionTracks = 0;
  let keyframeCount = 0;

  for (const track of tracks || []) {
    bones.add(track.bone);
    properties.set(track.property, (properties.get(track.property) || 0) + 1);
    keyframeCount += track.times?.length || 0;
    if (track.property === 'position') {
      positionTracks += 1;
    } else if (track.property === 'quaternion') {
      quaternionTracks += 1;
    }
  }

  return {
    total: tracks?.length || 0,
    position: positionTracks,
    quaternion: quaternionTracks,
    animatedBones: bones.size,
    keyframes: keyframeCount,
    properties: Object.fromEntries(properties),
  };
}

function analyzeHipMotion(tracks) {
  const track = tracks?.find((item) => item.bone === 'hips' && item.property === 'position');
  if (!track?.values?.length) {
    return null;
  }

  const points = [];
  for (let i = 0; i < track.values.length; i += 3) {
    points.push(new THREE.Vector3(track.values[i], track.values[i + 1], track.values[i + 2]));
  }

  const first = points[0];
  const last = points[points.length - 1];
  const x = range(points.map((point) => point.x));
  const y = range(points.map((point) => point.y));
  const z = range(points.map((point) => point.z));
  let travel = 0;
  let horizontalTravel = 0;

  for (let i = 1; i < points.length; i += 1) {
    travel += points[i].distanceTo(points[i - 1]);
    horizontalTravel += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].z - points[i - 1].z
    );
  }

  return {
    samples: points.length,
    start: first.toArray(),
    end: last.toArray(),
    x,
    y,
    z,
    travel,
    horizontalTravel,
    verticalRange: y.range,
  };
}

function summarizeFootSamples(samples, floorHeight) {
  const byBone = new Map();
  for (const sample of samples) {
    if (!byBone.has(sample.bone)) {
      byBone.set(sample.bone, []);
    }
    byBone.get(sample.bone).push(sample);
  }

  const summary = {};
  for (const [bone, boneSamples] of byBone) {
    const heights = boneSamples.map((sample) => sample.position[1]);
    const relativeHeights = boneSamples.map((sample) => sample.height);
    const velocities = boneSamples
      .map((sample) => sample.velocity)
      .filter(Number.isFinite);
    const positions = boneSamples.map((sample) => new THREE.Vector3().fromArray(sample.position));

    summary[bone] = {
      samples: boneSamples.length,
      planted: boneSamples.some((sample) => sample.planted),
      worldY: range(heights),
      height: range(relativeHeights),
      velocity: range(velocities),
      averageVelocity: average(velocities),
      travel: pathLength(positions),
      belowFloorSamples: boneSamples.filter((sample) => isBelowFloor(sample.position[1], floorHeight)).length,
      contactSamples: boneSamples.filter((sample) => sample.contact).length,
      minFloorClearance: Math.min(...boneSamples.map((sample) => sample.floorClearance)),
    };
  }

  return summary;
}

function getContactBaselines(samples) {
  const baselines = {};
  for (const sample of samples) {
    const y = sample.position[1];
    baselines[sample.bone] = Number.isFinite(baselines[sample.bone])
      ? Math.min(baselines[sample.bone], y)
      : y;
  }
  return baselines;
}

function summarizeBoundsSamples(samples, floorHeight) {
  if (!samples.length) return null;

  const minY = samples.map((sample) => sample.min[1]);
  const maxY = samples.map((sample) => sample.max[1]);
  const heights = samples.map((sample) => sample.size[1]);

  return {
    samples: samples.length,
    minY: range(minY),
    maxY: range(maxY),
    height: range(heights),
    belowFloorSamples: samples.filter((sample) => isBelowFloor(sample.min[1], floorHeight)).length,
    minFloorClearance: Math.min(...samples.map((sample) => sample.min[1] - floorHeight)),
  };
}

function finalizeContact(contact, lastActiveSample) {
  const end = lastActiveSample?.time ?? contact.endTime;
  const duration = Math.max(0, end - contact.start);
  const averageVelocity = contact.sampleCount > 0
    ? contact.averageVelocity / contact.sampleCount
    : 0;
  const confidence = THREE.MathUtils.clamp(
    contact.sampleCount / 6 + (contact.maxHeight <= PLANT_HEIGHT_THRESHOLD ? 0.25 : 0),
    0,
    1
  );

  return {
    bone: contact.bone,
    chainName: contact.chainName,
    endBone: contact.endBone,
    start: contact.start,
    end,
    duration,
    anchor: contact.anchor,
    sampleCount: contact.sampleCount,
    minHeight: contact.minHeight,
    maxHeight: contact.maxHeight,
    averageVelocity,
    confidence,
  };
}

function range(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return { min: 0, max: 0, range: 0 };
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return { min, max, range: max - min };
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += points[i].distanceTo(points[i - 1]);
  }
  return length;
}

function isBelowFloor(value, floorHeight) {
  return value < floorHeight - FLOOR_EPSILON;
}

function getPenetrationDepth(value, floorHeight) {
  const depth = floorHeight - value;
  return depth > FLOOR_EPSILON ? depth : 0;
}
