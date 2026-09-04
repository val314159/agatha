import * as THREE from 'three';
import { getHumanoidBoneNode, getWorldPosition, vectorToObject } from './utils.js';

const HUMANOID_BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftEye',
  'rightEye',
  'jaw',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftThumbMetacarpal',
  'leftThumbProximal',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
  'rightThumbMetacarpal',
  'rightThumbProximal',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
];
const ROTATION_AXES = ['x', 'y', 'z'];

function getBoneEntryKey(entry) {
  return `${entry.mode}:${entry.id}`;
}

function normalizeRotationDegrees(rotationDegrees = {}, fallbackRotation) {
  const fallback = {
    x: THREE.MathUtils.radToDeg(fallbackRotation.x),
    y: THREE.MathUtils.radToDeg(fallbackRotation.y),
    z: THREE.MathUtils.radToDeg(fallbackRotation.z),
  };

  return ROTATION_AXES.reduce((result, axis) => {
    const value = Number(rotationDegrees[axis]);
    result[axis] = Number.isFinite(value) ? clampRotationDegrees(value) : fallback[axis];
    return result;
  }, {});
}

function clampRotationDegrees(value) {
  return THREE.MathUtils.clamp(value, -180, 180);
}

export class Rig {
  constructor(stage) {
    this.stage = stage;
    this.currentRoot = null;
    this.currentVrm = null;
    this.rawBoneMap = new Map();
    this.humanoidBoneMap = new Map();
    this.selectedBone = null;
    this.selectedBoneEntry = null;
    this.manualBoneRotations = new Map();
    this.skeletonVisible = false;
    this.selectedAxesVisible = true;
    this.skeletonHelper = null;
    this.selectedAxesHelper = null;
  }

  indexBones(root, vrm) {
    this.clear();
    this.currentRoot = root || null;
    this.currentVrm = vrm || null;

    if (!root) return;

    root.traverse((object) => {
      if (!object.isBone) return;
      this.rawBoneMap.set(object.uuid, {
        id: object.uuid,
        mode: 'raw',
        name: object.name || object.uuid,
        sourceName: object.name || object.uuid,
        bone: object,
        restQuaternion: object.quaternion.clone(),
      });
    });

    const humanoid = vrm?.humanoid;
    if (!humanoid) return;

    HUMANOID_BONE_NAMES.forEach((name) => {
      const bone = getHumanoidBoneNode(humanoid, name);
      if (!bone) return;
      this.humanoidBoneMap.set(name, {
        id: name,
        mode: 'humanoid',
        name,
        sourceName: bone.name || name,
        bone,
        restQuaternion: bone.quaternion.clone(),
      });
    });

    this.refreshSkeletonHelper();
  }

  getRigInfo(mode = 'humanoid') {
    const map = mode === 'raw' ? this.rawBoneMap : this.humanoidBoneMap;
    return {
      mode,
      bones: [...map.values()].map((entry) => ({
        id: entry.id,
        name: entry.name,
        sourceName: entry.sourceName,
        parentName: entry.bone.parent?.name || '-',
        childCount: entry.bone.children.length,
        selected: entry.bone === this.selectedBone,
      })),
    };
  }

  selectBone(id, mode = 'humanoid') {
    const map = mode === 'raw' ? this.rawBoneMap : this.humanoidBoneMap;
    const entry = map.get(id) || null;
    this.selectedBone = entry?.bone || null;
    this.selectedBoneEntry = entry;
    this.updateSelectedAxes();
    return entry ? this.getBoneDetails(entry) : null;
  }

  setSelectedBoneRotation(rotationDegrees) {
    if (!this.selectedBoneEntry) return null;

    const entry = this.selectedBoneEntry;
    const rotation = normalizeRotationDegrees(rotationDegrees, entry.bone.rotation);
    const key = getBoneEntryKey(entry);

    this.manualBoneRotations.set(key, {
      mode: entry.mode,
      bone: entry.bone,
      rotation,
    });
    this.applyBoneRotation(entry.bone, rotation);

    if (entry.mode === 'humanoid') {
      this.currentVrm?.update?.(0);
    }

    entry.bone.updateWorldMatrix(true, false);
    this.updateSelectedAxes();
    return this.getBoneDetails(entry);
  }

  resetSelectedBoneRotation() {
    if (!this.selectedBoneEntry) return null;

    const entry = this.selectedBoneEntry;
    this.manualBoneRotations.delete(getBoneEntryKey(entry));
    entry.bone.quaternion.copy(entry.restQuaternion);

    if (entry.mode === 'humanoid') {
      this.currentVrm?.update?.(0);
    }

    entry.bone.updateWorldMatrix(true, false);
    this.updateSelectedAxes();
    return this.getBoneDetails(entry);
  }

  setSkeletonVisible(visible) {
    this.skeletonVisible = Boolean(visible);
    this.refreshSkeletonHelper();
  }

  setSelectedAxesVisible(visible) {
    this.selectedAxesVisible = Boolean(visible);
    this.updateSelectedAxes();
  }

  applyManualBoneRotations(mode) {
    this.manualBoneRotations.forEach((override) => {
      if (override.mode !== mode) return;
      this.applyBoneRotation(override.bone, override.rotation);
    });
  }

  applyBoneRotation(bone, rotationDegrees) {
    bone.rotation.set(
      THREE.MathUtils.degToRad(rotationDegrees.x),
      THREE.MathUtils.degToRad(rotationDegrees.y),
      THREE.MathUtils.degToRad(rotationDegrees.z),
      bone.rotation.order,
    );
  }

  getBoneDetails(entry) {
    const localPosition = entry.bone.position;
    const localRotation = entry.bone.rotation;
    const worldPosition = new THREE.Vector3();
    entry.bone.getWorldPosition(worldPosition);

    return {
      id: entry.id,
      name: entry.name,
      sourceName: entry.sourceName,
      parentName: entry.bone.parent?.name || '-',
      childCount: entry.bone.children.length,
      localPosition: vectorToObject(localPosition),
      localRotation: {
        x: THREE.MathUtils.radToDeg(localRotation.x),
        y: THREE.MathUtils.radToDeg(localRotation.y),
        z: THREE.MathUtils.radToDeg(localRotation.z),
      },
      worldPosition: vectorToObject(worldPosition),
    };
  }

  refreshSkeletonHelper() {
    if (this.skeletonHelper) {
      this.stage.scene.remove(this.skeletonHelper);
      this.skeletonHelper.dispose?.();
      this.skeletonHelper = null;
    }

    if (!this.skeletonVisible || !this.currentRoot) {
      return;
    }

    this.skeletonHelper = new THREE.SkeletonHelper(this.currentRoot);
    this.skeletonHelper.material.depthTest = false;
    this.skeletonHelper.material.transparent = true;
    this.skeletonHelper.material.opacity = 0.75;
    this.stage.scene.add(this.skeletonHelper);
  }

  updateSelectedAxes() {
    if (!this.selectedAxesHelper) {
      this.selectedAxesHelper = new THREE.AxesHelper(0.16);
      this.selectedAxesHelper.renderOrder = 2;
      this.stage.scene.add(this.selectedAxesHelper);
    }

    this.selectedAxesHelper.visible = Boolean(this.selectedBone && this.selectedAxesVisible);
    if (!this.selectedBone || !this.selectedAxesHelper.visible) {
      return;
    }

    this.selectedBone.updateWorldMatrix(true, false);
    this.selectedBone.getWorldPosition(this.selectedAxesHelper.position);
    this.selectedBone.getWorldQuaternion(this.selectedAxesHelper.quaternion);
  }

  clear() {
    this.currentRoot = null;
    this.currentVrm = null;
    this.rawBoneMap.clear();
    this.humanoidBoneMap.clear();
    this.selectedBone = null;
    this.selectedBoneEntry = null;
    this.manualBoneRotations.clear();

    if (this.skeletonHelper) {
      this.stage.scene.remove(this.skeletonHelper);
      this.skeletonHelper.dispose?.();
      this.skeletonHelper = null;
    }

    this.updateSelectedAxes();
  }
}
