import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const MIXAMO_TO_HUMAN = {
  'mixamorigHips': 'hips',
  'mixamorigSpine': 'spine',
  'mixamorigSpine1': 'chest',
  'mixamorigSpine2': 'upperChest',
  'mixamorigNeck': 'neck',
  'mixamorigHead': 'head',
  'mixamorigLeftShoulder': 'leftShoulder',
  'mixamorigLeftArm': 'leftUpperArm',
  'mixamorigLeftForeArm': 'leftLowerArm',
  'mixamorigLeftHand': 'leftHand',
  'mixamorigRightShoulder': 'rightShoulder',
  'mixamorigRightArm': 'rightUpperArm',
  'mixamorigRightForeArm': 'rightLowerArm',
  'mixamorigRightHand': 'rightHand',
  'mixamorigLeftUpLeg': 'leftUpperLeg',
  'mixamorigLeftLeg': 'leftLowerLeg',
  'mixamorigLeftFoot': 'leftFoot',
  'mixamorigLeftToeBase': 'leftToes',
  'mixamorigRightUpLeg': 'rightUpperLeg',
  'mixamorigRightLeg': 'rightLowerLeg',
  'mixamorigRightFoot': 'rightFoot',
  'mixamorigRightToeBase': 'rightToes',
};

export class FbxToAva {
  constructor(options = {}) {
    this.explicitUnitScale = options.sourceUnitScale;
    this.boneMap = { ...MIXAMO_TO_HUMAN, ...(options.boneMap || {}) };
  }

  async convertFromUrl(url, label = url) {
    const loader = new FBXLoader();
    const root = await loader.loadAsync(url);
    return this.convert(root, label, url);
  }

  convert(root, label = 'untitled', sourceUrl = null) {
    const mixamoHips = root.getObjectByName('mixamorigHips');
    if (!mixamoHips) {
      throw new Error('No mixamorigHips found; is this a Mixamo FBX?');
    }

    this.sourceUnitScale = this.explicitUnitScale ?? this.inferUnitScale(root);

    return {
      format: 'ava',
      version: '1.0',
      name: label,
      source: sourceUrl ?? label,
      sourceUnits: this.sourceUnitScale === 1 ? 'm' : 'cm',
      sourceUnitScale: this.sourceUnitScale,
      sourceHipsHeight: this.getSourceHipsHeight(root),
      duration: this.getDuration(root),
      skeleton: this.extractSkeleton(root),
      tracks: this.extractTracks(root),
      locks: this.getLocks(),
    };
  }

  getLocks() {
    return [
      { bone: 'leftFoot', planted: true },
      { bone: 'rightFoot', planted: true },
      { bone: 'leftToes', planted: false },
      { bone: 'rightToes', planted: false },
      { bone: 'leftHand', planted: false },
      { bone: 'rightHand', planted: false },
    ];
  }

  inferUnitScale(root) {
    const rawHipsHeight = root.getObjectByName('mixamorigHips')?.position.y ?? 0;
    if (rawHipsHeight > 10) {
      return 0.01;
    }
    if (rawHipsHeight > 0.1 && rawHipsHeight < 10) {
      return 1;
    }
    return 0.01;
  }

  getSourceHipsHeight(root) {
    const mixamoHips = root.getObjectByName('mixamorigHips');
    if (!mixamoHips) return 0;
    return mixamoHips.position.y * this.sourceUnitScale;
  }

  extractSkeleton(root) {
    const bones = [];
    const seen = new Set();

    for (const [mixamoName, humanName] of Object.entries(this.boneMap)) {
      const node = root.getObjectByName(mixamoName);
      if (!node || seen.has(humanName)) continue;
      seen.add(humanName);

      const parentHumanName = this.findMappedAncestor(node.parent);

      const worldQuat = new THREE.Quaternion();
      node.getWorldQuaternion(worldQuat);
      const parentWorldQuat = new THREE.Quaternion();
      if (node.parent) node.parent.getWorldQuaternion(parentWorldQuat);

      bones.push({
        name: humanName,
        parent: parentHumanName,
        restPosition: this.toMeters([node.position.x, node.position.y, node.position.z]),
        restRotation: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w],
        restWorldRotation: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w],
        parentRestWorldRotation: [parentWorldQuat.x, parentWorldQuat.y, parentWorldQuat.z, parentWorldQuat.w],
      });
    }

    return { type: 'human', bones };
  }

  findMappedAncestor(node) {
    while (node) {
      const humanName = this.boneMap[node.name];
      if (humanName) return humanName;
      node = node.parent;
    }
    return null;
  }

  extractTracks(root) {
    const clips = root.animations || [];
    if (clips.length === 0) return [];

    const clip = clips[0];
    const tracks = [];

    for (const track of clip.tracks) {
      const [mixamoName, property] = track.name.split('.');
      const humanName = this.boneMap[mixamoName];
      if (!humanName) continue;

      tracks.push({
        bone: humanName,
        property,
        times: Array.from(track.times),
        values: this.convertValues(track.values, property),
      });
    }

    return tracks;
  }

  convertValues(values, property) {
    const out = Array.from(values);
    if (property === 'position') {
      for (let i = 0; i < out.length; i += 3) {
        out[i] *= this.sourceUnitScale;
        out[i + 1] *= this.sourceUnitScale;
        out[i + 2] *= this.sourceUnitScale;
      }
    }
    return out;
  }

  getDuration(root) {
    const clips = root.animations || [];
    return clips.reduce((max, clip) => Math.max(max, clip.duration), 0);
  }

  toMeters(v) {
    return v.map((x) => x * this.sourceUnitScale);
  }
}
