import * as THREE from 'three';

const _vec3 = new THREE.Vector3();
const _vec3_2 = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _flatQuaternion = new Float32Array(4);

const HUMAN_TO_VRM = {
  'hips': 'hips',
  'spine': 'spine',
  'chest': 'chest',
  'upperChest': 'upperChest',
  'neck': 'neck',
  'head': 'head',
  'leftShoulder': 'leftShoulder',
  'leftUpperArm': 'leftUpperArm',
  'leftLowerArm': 'leftLowerArm',
  'leftHand': 'leftHand',
  'rightShoulder': 'rightShoulder',
  'rightUpperArm': 'rightUpperArm',
  'rightLowerArm': 'rightLowerArm',
  'rightHand': 'rightHand',
  'leftUpperLeg': 'leftUpperLeg',
  'leftLowerLeg': 'leftLowerLeg',
  'leftFoot': 'leftFoot',
  'leftToes': 'leftToes',
  'rightUpperLeg': 'rightUpperLeg',
  'rightLowerLeg': 'rightLowerLeg',
  'rightFoot': 'rightFoot',
  'rightToes': 'rightToes',
};

export class AvaToAvar {
  constructor(vrm, options = {}) {
    if (!vrm) throw new Error('AvaToAvar requires a VRM instance');
    this.vrm = vrm;
    this.modelPath = options.modelPath ?? '';
    this.humanToVrm = { ...HUMAN_TO_VRM, ...(options.humanToVrm || {}) };
  }

  bake(ava) {
    const positionScale = this.computePositionScale(ava);
    const boneMap = this.buildBoneMap();
    const tracks = this.bakeTracks(ava, positionScale);

    return {
      format: 'avar',
      version: '1.0',
      name: ava.name,
      source: ava.source,
      target: {
        type: 'vrm',
        modelPath: this.modelPath,
        boneMap,
      },
      sourceUnitScale: ava.sourceUnitScale,
      sourceHipsHeight: ava.sourceHipsHeight,
      targetHipsHeight: ava.sourceHipsHeight * positionScale,
      positionScale,
      duration: ava.duration,
      tracks,
      locks: ava.locks ?? [],
    };
  }

  computePositionScale(ava) {
    const sourceHipsHeight = ava.sourceHipsHeight ?? this.getBoneRestHeight(ava, 'hips');
    const vrmHipsNode = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!vrmHipsNode) return 1;

    const vrmHipsY = vrmHipsNode.getWorldPosition(_vec3).y;
    const vrmRootY = this.vrm.scene.getWorldPosition(_vec3_2).y;
    const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);

    return sourceHipsHeight > 0 ? vrmHipsHeight / sourceHipsHeight : 1;
  }

  getBoneRestHeight(ava, humanName) {
    const bone = ava.skeleton.bones.find((b) => b.name === humanName);
    if (!bone) return 0;
    return bone.restPosition[1];
  }

  buildBoneMap() {
    const map = {};
    for (const [humanName, vrmName] of Object.entries(this.humanToVrm)) {
      const node = this.vrm.humanoid?.getNormalizedBoneNode(vrmName);
      if (node) {
        map[humanName] = node.name;
      }
    }
    return map;
  }

  bakeTracks(ava, positionScale) {
    const tracks = [];
    const sourceBoneMap = Object.fromEntries(ava.skeleton.bones.map((b) => [b.name, b]));
    const sourceWorldRotations = computeSourceWorldRotations(ava);

    for (const track of ava.tracks) {
      const vrmName = this.humanToVrm[track.bone];
      if (!vrmName) continue;

      const vrmNode = this.vrm.humanoid?.getNormalizedBoneNode(vrmName);
      if (!vrmNode) continue;

      const sourceBone = sourceBoneMap[track.bone];
      if (!sourceBone) continue;

      if (track.property === 'quaternion') {
        tracks.push(this.bakeQuaternionTrack(track, sourceBone, vrmNode, sourceWorldRotations));
      } else if (track.property === 'position') {
        tracks.push(this.bakePositionTrack(track, vrmNode, positionScale));
      }
    }

    return tracks;
  }

  bakeQuaternionTrack(track, sourceBone, vrmNode, sourceWorldRotations) {
    const sourceRestWorldInverse = sourceWorldRotations[sourceBone.name].clone().invert();
    const parentRestWorldRotation = sourceBone.parentRestWorldRotation
      ? new THREE.Quaternion().fromArray(sourceBone.parentRestWorldRotation)
      : new THREE.Quaternion();
    const isVrm0 = this.vrm.meta?.metaVersion === '0';

    const values = new Float32Array(track.values.length);
    for (let i = 0; i < track.values.length; i += 4) {
      _flatQuaternion[0] = track.values[i];
      _flatQuaternion[1] = track.values[i + 1];
      _flatQuaternion[2] = track.values[i + 2];
      _flatQuaternion[3] = track.values[i + 3];

      _quatA.fromArray(_flatQuaternion);
      _quatA
        .premultiply(parentRestWorldRotation)
        .multiply(sourceRestWorldInverse);

      values[i] = isVrm0 ? -_quatA.x : _quatA.x;
      values[i + 1] = _quatA.y;
      values[i + 2] = isVrm0 ? -_quatA.z : _quatA.z;
      values[i + 3] = _quatA.w;
    }

    return {
      bone: this.humanToVrm[track.bone],
      property: 'quaternion',
      times: track.times.slice(),
      values: Array.from(values),
    };
  }

  bakePositionTrack(track, vrmNode, positionScale) {
    const isVrm0 = this.vrm.meta?.metaVersion === '0';
    const values = new Float32Array(track.values.length);

    for (let i = 0; i < track.values.length; i += 3) {
      const x = track.values[i];
      const y = track.values[i + 1];
      const z = track.values[i + 2];

      values[i] = (isVrm0 ? -x : x) * positionScale;
      values[i + 1] = y * positionScale;
      values[i + 2] = (isVrm0 ? -z : z) * positionScale;
    }

    return {
      bone: this.humanToVrm[track.bone],
      property: 'position',
      times: track.times.slice(),
      values: Array.from(values),
    };
  }
}

function computeSourceWorldRotations(ava) {
  const worldRotations = {};
  for (const bone of ava.skeleton.bones) {
    worldRotations[bone.name] = new THREE.Quaternion().fromArray(
      bone.restWorldRotation || bone.restRotation
    );
  }
  return worldRotations;
}
