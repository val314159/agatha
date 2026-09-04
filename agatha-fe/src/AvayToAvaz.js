import * as THREE from 'three';
import {
  applyWorldOffset,
  applyFootPlantHipOffset,
  captureFootPlant,
  derivePoleDirection,
  getNormalizedLimbChain,
  makePolePoint as makeIkPolePoint,
  solveLimbIK,
} from './ik.js';
import {
  cloneLocks,
  cloneTarget,
  collectTrackTimes,
  createAnimationClip,
  trackKey,
} from './playableAnimation.js';

const VRM_LIMB_CHAINS = {
  leftLeg: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot'],
  rightLeg: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'],
};
const TIME_EPSILON = 1e-5;
const FLOOR_CLEARANCE_EPSILON = 1e-4;
const FLOOR_CLEARANCE_PADDING = 0.002;

export class SimpleBalanceSolver {
  constructor(options = {}) {
    this.maxCorrection = options.maxCorrection ?? 0.05;
    this.iterations = options.iterations ?? 1;
  }

  solve(vrm, plantedFeet, solve) {
    if (!plantedFeet?.length) return { applied: false, correction: new THREE.Vector3() };

    const plants = plantedFeet.map((p) => ({
      foot: p.foot,
      anchor: p.anchor,
      weight: p.weight ?? 1,
      axes: p.axes ?? { x: true, y: false, z: true },
    }));

    return applyFootPlantHipOffset({
      hips: vrm.humanoid?.getNormalizedBoneNode('hips'),
      root: vrm.scene,
      plantedFeet: plants,
      solve,
      iterations: this.iterations,
      maxCorrection: this.maxCorrection,
      axes: { x: true, y: false, z: true },
    });
  }
}

export class AvayToAvaz {
  constructor(vrm, options = {}) {
    if (!vrm) throw new Error('AvayToAvaz requires a VRM instance');
    this.vrm = vrm;
    this.modelPath = options.modelPath ?? '';
    this.balanceSolver = options.balanceSolver ?? new SimpleBalanceSolver();
    this.iterations = options.iterations ?? 2;
  }

  bake(avay) {
    if (!avay?.tracks?.length) return null;

    const floorClearance = this.getFloorClearance(avay.analysis);
    const contacts = this.normalizeContacts(avay.analysis?.contacts || [], floorClearance);
    if (!floorClearance && contacts.length === 0) {
      return createIdentityAvaz(avay);
    }

    const clip = createAnimationClip(avay);
    const mixer = new THREE.AnimationMixer(this.vrm.scene);
    const action = mixer.clipAction(clip);
    action.play();

    const times = collectTrackTimes(avay.tracks);
    const layers = [];
    const correctedKeyframes = new Map();
    for (const chainName of new Set(contacts.map((contact) => contact.chainName))) {
      correctedKeyframes.set(chainName, {
        upperLeg: { times: [], values: [] },
        lowerLeg: { times: [], values: [] },
        end: { times: [], values: [] },
      });
    }
    const hipKeyframes = { times: [], values: [] };
    const balanceStats = { applied: 0, maxCorrection: 0 };
    const shouldExtractHips = Boolean(floorClearance || contacts.length > 0);

    for (const t of times) {
      mixer.setTime(t);
      this.vrm.update?.(0);
      this.vrm.scene.updateWorldMatrix(true, true);

      this.applyFloorClearance(floorClearance);

      const activeContacts = contacts.filter((contact) => isContactActive(contact, t));
      const solve = () => {
        for (const contact of activeContacts) {
          const limbChain = getNormalizedLimbChain(this.vrm, contact.chainName);
          if (!limbChain) continue;
          solveLimbIK(limbChain, contact.anchor, this.makePolePoint(limbChain));
        }
      };

      for (let iter = 0; iter < this.iterations; iter += 1) {
        solve();
        if (this.balanceSolver) {
          const result = this.balanceSolver.solve(this.vrm, this.getPlantedFeet(activeContacts), solve);
          if (result?.applied) {
            balanceStats.applied += 1;
            balanceStats.maxCorrection = Math.max(
              balanceStats.maxCorrection,
              result.correction?.length?.() || 0
            );
          }
        }
      }

      this.extractCorrectedChainKeyframes(correctedKeyframes, t);
      if (shouldExtractHips) {
        this.extractHipKeyframe(hipKeyframes, t);
      }
    }

    mixer.setTime(0);
    action.stop();
    mixer.stopAllAction();

    const newTracks = this.buildTracks(correctedKeyframes, hipKeyframes);
    const correctedProperties = new Set(newTracks.map(trackKey));
    const unchangedTracks = avay.tracks.filter((track) => !correctedProperties.has(trackKey(track)));

    if (floorClearance) {
      layers.push({
        type: 'floorClearance',
        source: 'avay.analysis.floor',
        correction: floorClearance.toArray(),
        correctionY: floorClearance.y,
        affectedProperties: ['hips.position'],
      });
    }
    if (contacts.length > 0) {
      layers.push({
        type: 'footPlantIK',
        source: 'avay.analysis.contacts',
        contactCount: contacts.length,
        affectedProperties: Array.from(correctedProperties).filter((key) => key !== 'hips.position'),
      });
    }
    if (balanceStats.applied > 0) {
      layers.push({
        type: 'balance',
        source: 'active foot plant contacts',
        applications: balanceStats.applied,
        maxCorrection: balanceStats.maxCorrection,
        affectedProperties: ['hips.position'],
      });
    }

    return {
      format: 'avaz',
      version: '1.0',
      basis: 'solved',
      name: avay.name,
      source: avay.source,
      sourceFormat: avay.format,
      target: cloneTarget(avay.target),
      sourceUnitScale: avay.sourceUnitScale,
      sourceHipsHeight: avay.sourceHipsHeight,
      targetHipsHeight: avay.targetHipsHeight,
      positionScale: avay.positionScale,
      duration: avay.duration,
      tracks: [...unchangedTracks, ...newTracks],
      locks: cloneLocks(avay.locks || []),
      analysis: avay.analysis,
      layers,
    };
  }

  getFloorClearance(analysis) {
    const penetrationDepth = Number(analysis?.floor?.penetrationDepth || 0);
    if (penetrationDepth <= FLOOR_CLEARANCE_EPSILON) return null;
    return new THREE.Vector3(0, penetrationDepth + FLOOR_CLEARANCE_PADDING, 0);
  }

  applyFloorClearance(floorClearance) {
    if (!floorClearance) return;
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;
    applyWorldOffset(hips, floorClearance);
    this.vrm.scene.updateWorldMatrix(true, true);
  }

  normalizeContacts(contacts, floorClearance = null) {
    return contacts
      .map((contact) => {
        const bones = VRM_LIMB_CHAINS[contact.chainName];
        if (!bones || !Array.isArray(contact.anchor)) return null;
        const anchor = new THREE.Vector3().fromArray(contact.anchor);
        if (floorClearance) {
          anchor.add(floorClearance);
        }
        return {
          bone: contact.bone,
          chainName: contact.chainName,
          start: Number(contact.start),
          end: Number(contact.end),
          anchor,
        };
      })
      .filter((contact) => (
        contact &&
        Number.isFinite(contact.start) &&
        Number.isFinite(contact.end)
      ));
  }

  getPlantedFeet(activeContacts) {
    return activeContacts
      .map((contact) => {
        const foot = this.vrm.humanoid?.getNormalizedBoneNode(VRM_LIMB_CHAINS[contact.chainName]?.[2]);
        if (!foot || !contact.anchor) return null;
        return captureFootPlant(foot, { anchor: contact.anchor, weight: 1 });
      })
      .filter(Boolean);
  }

  makePolePoint(limbChain) {
    const rootPosition = limbChain.root.getWorldPosition(new THREE.Vector3());
    const midPosition = limbChain.mid.getWorldPosition(new THREE.Vector3());
    const endPosition = limbChain.end.getWorldPosition(new THREE.Vector3());
    const poleDirection = derivePoleDirection(rootPosition, endPosition, midPosition);
    const distance = Math.max(rootPosition.distanceTo(endPosition), 0.25);
    return makeIkPolePoint(rootPosition, poleDirection, distance);
  }

  extractCorrectedChainKeyframes(correctedKeyframes, t) {
    for (const [chainName, kfs] of correctedKeyframes) {
      const bones = VRM_LIMB_CHAINS[chainName];
      if (!bones) continue;

      const upper = this.vrm.humanoid?.getNormalizedBoneNode(bones[0]);
      const lower = this.vrm.humanoid?.getNormalizedBoneNode(bones[1]);
      const end = this.vrm.humanoid?.getNormalizedBoneNode(bones[2]);
      if (!upper || !lower || !end) continue;

      kfs.upperLeg.times.push(t);
      kfs.upperLeg.values.push(
        upper.quaternion.x,
        upper.quaternion.y,
        upper.quaternion.z,
        upper.quaternion.w
      );
      kfs.lowerLeg.times.push(t);
      kfs.lowerLeg.values.push(
        lower.quaternion.x,
        lower.quaternion.y,
        lower.quaternion.z,
        lower.quaternion.w
      );
      kfs.end.times.push(t);
      kfs.end.values.push(
        end.quaternion.x,
        end.quaternion.y,
        end.quaternion.z,
        end.quaternion.w
      );
    }
  }

  extractHipKeyframe(hipKeyframes, t) {
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;
    hipKeyframes.times.push(t);
    hipKeyframes.values.push(hips.position.x, hips.position.y, hips.position.z);
  }

  buildTracks(correctedKeyframes, hipKeyframes) {
    const tracks = [];
    for (const [chainName, bones] of Object.entries(VRM_LIMB_CHAINS)) {
      const kfs = correctedKeyframes.get(chainName);
      if (!kfs) continue;

      if (kfs.upperLeg.times.length > 0) {
        tracks.push({
          bone: bones[0],
          property: 'quaternion',
          times: kfs.upperLeg.times.slice(),
          values: kfs.upperLeg.values.slice(),
        });
      }
      if (kfs.lowerLeg.times.length > 0) {
        tracks.push({
          bone: bones[1],
          property: 'quaternion',
          times: kfs.lowerLeg.times.slice(),
          values: kfs.lowerLeg.values.slice(),
        });
      }
      if (kfs.end.times.length > 0) {
        tracks.push({
          bone: bones[2],
          property: 'quaternion',
          times: kfs.end.times.slice(),
          values: kfs.end.values.slice(),
        });
      }
    }

    if (hipKeyframes.times.length > 0) {
      tracks.push({
        bone: 'hips',
        property: 'position',
        times: hipKeyframes.times.slice(),
        values: hipKeyframes.values.slice(),
      });
    }

    return tracks;
  }
}

function isContactActive(contact, time) {
  return time + TIME_EPSILON >= contact.start && time - TIME_EPSILON <= contact.end;
}

function createIdentityAvaz(avay) {
  return {
    ...avay,
    format: 'avaz',
    basis: 'solved',
    sourceFormat: avay.format,
    target: cloneTarget(avay.target),
    tracks: avay.tracks.map((track) => ({
      bone: track.bone,
      property: track.property,
      times: Array.from(track.times || []),
      values: Array.from(track.values || []),
    })),
    locks: cloneLocks(avay.locks || []),
    layers: [],
  };
}
