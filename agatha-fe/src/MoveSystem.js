import * as THREE from 'three';
import {
  applyFootPlantHipOffset,
  applyWorldOffset,
  getNormalizedLimbChain,
  solveLimbIK,
} from './ik.js';
import { MOVE_PRESETS, getMovePreset } from './movePresets.js';
import {
  applyLocalRotationOffset,
  getHumanoidBoneNode,
  getWorldPosition,
  vectorToObject,
} from './utils.js';

const MOVE_HELPERS = [
  ['leftHand', 0xe38b29, 'dot'],
  ['rightHand', 0xe38b29, 'dot'],
  ['leftFoot', 0x247c87, 'dot'],
  ['rightFoot', 0x247c87, 'dot'],
  ['leftFootAnchor', 0x247c87, 'ring'],
  ['rightFootAnchor', 0x247c87, 'ring'],
  ['leftElbowPole', 0x7657c9, 'dot'],
  ['rightElbowPole', 0x7657c9, 'dot'],
  ['leftKneePole', 0x2f7d55, 'dot'],
  ['rightKneePole', 0x2f7d55, 'dot'],
];
const FOOT_PLANT_AXES = { x: true, y: false, z: true };

export class MoveSystem {
  constructor(stage, callbacks = {}) {
    this.stage = stage;
    this.callbacks = callbacks;
    this.currentRoot = null;
    this.currentVrm = null;
    this.moveRig = null;
    this.moveFootPlants = new Map();
    this.moveHelperGroup = null;
    this.moveHelpers = new Map();
    this.moveStatus = null;
    this.move = {
      presetId: MOVE_PRESETS[0].id,
      playing: false,
      time: 0,
      speed: 1,
      showHelpers: true,
      footLock: true,
    };
  }

  getPresets() {
    return MOVE_PRESETS.map((move) => ({
      id: move.id,
      name: move.name,
    }));
  }

  getStatus() {
    if (this.moveStatus) {
      return {
        ...this.moveStatus,
        correction: { ...this.moveStatus.correction },
        plantedFeet: [...this.moveStatus.plantedFeet],
      };
    }

    const preset = getMovePreset(this.move.presetId);
    return {
      ready: Boolean(this.moveRig),
      playing: this.move.playing,
      presetId: preset.id,
      presetName: preset.name,
      time: this.move.time,
      phase: 0,
      footLock: this.move.footLock,
      showHelpers: this.move.showHelpers,
      plantedFeet: [],
      correction: { x: 0, y: 0, z: 0 },
    };
  }

  setPreset(id) {
    const preset = getMovePreset(id);
    this.move.presetId = preset.id;
    this.move.time = 0;
    this.moveFootPlants.clear();
    this.applyAtCurrentTime();
    this.emitStatus();
  }

  setPlaying(playing) {
    this.move.playing = Boolean(playing && this.moveRig);
    if (this.move.playing) {
      this.moveFootPlants.clear();
    }
    this.updateHelpersVisibility();
    this.emitStatus();
  }

  setSpeed(speed) {
    const value = Number(speed);
    this.move.speed = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0.15, 2.5) : 1;
    this.emitStatus();
  }

  setOptions(options = {}) {
    if (typeof options.showHelpers === 'boolean') {
      this.move.showHelpers = options.showHelpers;
    }
    if (typeof options.footLock === 'boolean') {
      this.move.footLock = options.footLock;
      this.moveFootPlants.clear();
    }
    this.updateHelpersVisibility();
    this.emitStatus();
  }

  reset() {
    this.move.time = 0;
    this.move.playing = false;
    this.moveFootPlants.clear();
    this.currentVrm?.humanoid?.resetNormalizedPose?.();
    this.currentVrm?.update?.(0);
    this.clearHelperPositions();
    this.updateHelpersVisibility();
    this.emitStatus();
  }

  setupMoveRig(root, vrm) {
    this.clear();
    this.currentRoot = root || null;
    this.currentVrm = vrm || null;

    const humanoid = vrm?.humanoid;
    if (!humanoid || !root) {
      this.updateHelpersVisibility();
      this.emitStatus();
      return;
    }

    humanoid.resetNormalizedPose?.();
    vrm?.update?.(0);
    root.updateWorldMatrix(true, true);

    const chains = {
      leftArm: getNormalizedLimbChain(this.currentVrm, 'leftArm'),
      rightArm: getNormalizedLimbChain(this.currentVrm, 'rightArm'),
      leftLeg: getNormalizedLimbChain(this.currentVrm, 'leftLeg'),
      rightLeg: getNormalizedLimbChain(this.currentVrm, 'rightLeg'),
    };
    const hips = getHumanoidBoneNode(humanoid, 'hips');
    const chest = getHumanoidBoneNode(humanoid, 'chest') || getHumanoidBoneNode(humanoid, 'spine');
    const head = getHumanoidBoneNode(humanoid, 'head');

    if (!hips || !chest || !head || Object.values(chains).some((chain) => !chain)) {
      this.updateHelpersVisibility();
      this.emitStatus();
      return;
    }

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.max(size.y || 0, 1);
    const rootWorldToLocal = (point) => root.worldToLocal(point.clone());
    const leftHandRest = getWorldPosition(chains.leftArm.end);
    const rightHandRest = getWorldPosition(chains.rightArm.end);

    this.moveRig = {
      humanoid,
      chains,
      bones: { hips, chest, head },
      metrics: {
        scale,
        rightLocal: rootWorldToLocal(rightHandRest)
          .sub(rootWorldToLocal(leftHandRest))
          .normalize(),
      },
      rest: {
        hips: getWorldPosition(hips),
        chest: getWorldPosition(chest),
        head: getWorldPosition(head),
        leftHandRest,
        rightHandRest,
        leftFootRest: getWorldPosition(chains.leftLeg.end),
        rightFootRest: getWorldPosition(chains.rightLeg.end),
        hipsQuaternion: hips.quaternion.clone(),
        chestQuaternion: chest.quaternion.clone(),
        headQuaternion: head.quaternion.clone(),
      },
    };
    this.moveRig.restLocal = {
      hips: rootWorldToLocal(this.moveRig.rest.hips),
      chest: rootWorldToLocal(this.moveRig.rest.chest),
      head: rootWorldToLocal(this.moveRig.rest.head),
      leftHandRest: rootWorldToLocal(this.moveRig.rest.leftHandRest),
      rightHandRest: rootWorldToLocal(this.moveRig.rest.rightHandRest),
      leftFootRest: rootWorldToLocal(this.moveRig.rest.leftFootRest),
      rightFootRest: rootWorldToLocal(this.moveRig.rest.rightFootRest),
    };

    this.ensureHelpers();
    this.applyAtCurrentTime();
    this.updateHelpersVisibility();
    this.emitStatus();
  }

  update(delta) {
    if (!this.moveRig || !this.move.playing) return;

    this.move.time += delta * this.move.speed;
    this.applyAtCurrentTime();
  }

  applyAtCurrentTime() {
    if (!this.moveRig || !this.currentVrm) return;

    const preset = getMovePreset(this.move.presetId);
    const sample = preset.sample(this.move.time, preset.tempo);
    const correction = this.applySample(sample);

    this.moveStatus = {
      ready: true,
      playing: this.move.playing,
      presetId: preset.id,
      presetName: preset.name,
      time: this.move.time,
      phase: sample.phase || 0,
      footLock: this.move.footLock,
      showHelpers: this.move.showHelpers,
      plantedFeet: [...this.moveFootPlants.keys()],
      correction: vectorToObject(correction),
    };
  }

  applySample(sample) {
    const rig = this.moveRig;
    const helperPoints = new Map();

    rig.humanoid.resetNormalizedPose?.();
    this.currentRoot.updateWorldMatrix(true, true);

    this.applyBody(sample);
    this.currentRoot.updateWorldMatrix(true, true);

    const handTargets = {
      left: this.resolveMovePoint(sample.hands.left),
      right: this.resolveMovePoint(sample.hands.right),
    };
    const handPoles = {
      left: this.resolveMovePoint(sample.handPoles.left),
      right: this.resolveMovePoint(sample.handPoles.right),
    };
    const footTargets = {
      left: this.resolveMovePoint(sample.feet.left),
      right: this.resolveMovePoint(sample.feet.right),
    };
    const footSolveTargets = {
      left: this.resolveFootTarget('left', sample.feet.left, rig.chains.leftLeg.end, footTargets.left),
      right: this.resolveFootTarget('right', sample.feet.right, rig.chains.rightLeg.end, footTargets.right),
    };
    const footPoles = {
      left: this.resolveMovePoint(sample.footPoles.left),
      right: this.resolveMovePoint(sample.footPoles.right),
    };

    helperPoints.set('leftHand', handTargets.left);
    helperPoints.set('rightHand', handTargets.right);
    helperPoints.set('leftFoot', footTargets.left);
    helperPoints.set('rightFoot', footTargets.right);
    if (this.moveFootPlants.has('leftFoot')) {
      helperPoints.set('leftFootAnchor', this.getPlantWorldAnchor(this.moveFootPlants.get('leftFoot')));
    }
    if (this.moveFootPlants.has('rightFoot')) {
      helperPoints.set('rightFootAnchor', this.getPlantWorldAnchor(this.moveFootPlants.get('rightFoot')));
    }
    helperPoints.set('leftElbowPole', handPoles.left);
    helperPoints.set('rightElbowPole', handPoles.right);
    helperPoints.set('leftKneePole', footPoles.left);
    helperPoints.set('rightKneePole', footPoles.right);

    const solve = () => {
      solveLimbIK(rig.chains.leftArm, handTargets.left, handPoles.left);
      solveLimbIK(rig.chains.rightArm, handTargets.right, handPoles.right);
      solveLimbIK(rig.chains.leftLeg, footSolveTargets.left, footPoles.left);
      solveLimbIK(rig.chains.rightLeg, footSolveTargets.right, footPoles.right);
    };

    solve();
    let correction = new THREE.Vector3();
    const plantedFeet = [...this.moveFootPlants.values()].map((plant) => ({
      ...plant,
      anchor: this.getPlantWorldAnchor(plant),
    }));
    if (this.move.footLock && plantedFeet.length > 0) {
      const result = applyFootPlantHipOffset({
        hips: rig.bones.hips,
        plantedFeet,
        solve,
        iterations: 2,
        maxCorrection: rig.metrics.scale * 0.05,
        axes: FOOT_PLANT_AXES,
      });
      correction = result.correction;
    }

    this.updateHelpers(helperPoints);
    return correction;
  }

  applyBody(sample) {
    const rig = this.moveRig;
    const hipsOffset = this.vectorFromMoveOffset(sample.hips || {});

    applyLocalRotationOffset(rig.bones.hips, rig.rest.hipsQuaternion, sample.hips);
    applyWorldOffset(rig.bones.hips, hipsOffset);

    applyLocalRotationOffset(rig.bones.chest, rig.rest.chestQuaternion, sample.chest);
    applyLocalRotationOffset(rig.bones.head, rig.rest.headQuaternion, sample.head);
  }

  resolveFootTarget(side, spec, foot, target) {
    const plantKey = side === 'left' ? 'leftFoot' : 'rightFoot';

    if (!this.move.footLock || !spec.planted) {
      this.moveFootPlants.delete(plantKey);
      return target;
    }

    if (!this.moveFootPlants.has(plantKey)) {
      this.currentRoot?.updateWorldMatrix(true, false);
      this.moveFootPlants.set(plantKey, {
        foot,
        anchorLocal: this.currentRoot ? this.currentRoot.worldToLocal(target.clone()) : target.clone(),
        weight: 1,
        axes: FOOT_PLANT_AXES,
      });
    }

    return this.getPlantWorldAnchor(this.moveFootPlants.get(plantKey));
  }

  getPlantWorldAnchor(plant) {
    if (!this.currentRoot || !plant.anchorLocal) {
      return plant.anchor?.clone() || new THREE.Vector3();
    }
    this.currentRoot.updateWorldMatrix(true, false);
    return this.currentRoot.localToWorld(plant.anchorLocal.clone());
  }

  resolveMovePoint(spec) {
    if (spec.space === 'blend') {
      const a = this.resolveMovePoint(spec.a);
      const b = this.resolveMovePoint(spec.b);
      return a.lerp(b, spec.amount);
    }

    const base = this.getMoveSpacePosition(spec.space);
    return base.add(this.vectorFromMoveOffset(spec));
  }

  getMoveSpacePosition(space) {
    const rig = this.moveRig;
    if (rig.restLocal?.[space] && this.currentRoot) {
      this.currentRoot.updateWorldMatrix(true, false);
      return this.currentRoot.localToWorld(rig.restLocal[space].clone());
    }
    if (rig.rest[space]) return rig.rest[space].clone();

    if (space === 'hips') return getWorldPosition(rig.bones.hips);
    if (space === 'chest') return getWorldPosition(rig.bones.chest);
    if (space === 'head') return getWorldPosition(rig.bones.head);

    return rig.rest.hips.clone();
  }

  vectorFromMoveOffset(offset = {}) {
    const axes = this.getMoveAxes();
    const scale = this.moveRig?.metrics.scale || 1;

    return new THREE.Vector3()
      .addScaledVector(axes.right, (offset.x || 0) * scale)
      .addScaledVector(axes.up, (offset.y || 0) * scale)
      .addScaledVector(axes.forward, (offset.z || 0) * scale);
  }

  getMoveAxes() {
    const quaternion = new THREE.Quaternion();
    this.currentRoot?.getWorldQuaternion(quaternion);
    const right = this.moveRig?.metrics.rightLocal
      ?.clone()
      .applyQuaternion(quaternion)
      .normalize() || new THREE.Vector3(1, 0, 0);

    return {
      right,
      up: new THREE.Vector3(0, 1, 0),
      forward: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize(),
    };
  }

  ensureHelpers() {
    if (this.moveHelperGroup) return;

    this.moveHelperGroup = new THREE.Group();
    this.moveHelperGroup.name = 'Move IK Helpers';
    this.stage.scene.add(this.moveHelperGroup);

    MOVE_HELPERS.forEach(([key, color, shape]) => {
      const geometry = shape === 'ring'
        ? new THREE.TorusGeometry(0.035, 0.0035, 8, 28)
        : new THREE.SphereGeometry(0.025, 12, 8);
      const helper = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          transparent: true,
          opacity: 0.86,
        }),
      );
      if (shape === 'ring') {
        helper.rotation.x = Math.PI / 2;
      }
      helper.renderOrder = 3;
      helper.visible = false;
      this.moveHelpers.set(key, helper);
      this.moveHelperGroup.add(helper);
    });
  }

  updateHelpers(points) {
    this.ensureHelpers();
    this.moveHelpers.forEach((helper, key) => {
      const point = points.get(key);
      helper.visible = Boolean(point);
      if (point) helper.position.copy(point);
    });
    this.updateHelpersVisibility();
  }

  clearHelperPositions() {
    this.moveHelpers.forEach((helper) => {
      helper.visible = false;
    });
  }

  updateHelpersVisibility() {
    if (!this.moveHelperGroup) return;
    this.moveHelperGroup.visible = Boolean(this.move.showHelpers && this.moveRig);
  }

  disposeHelpers() {
    if (!this.moveHelperGroup) return;
    this.stage.scene.remove(this.moveHelperGroup);
    this.moveHelpers.forEach((helper) => {
      helper.geometry?.dispose?.();
      helper.material?.dispose?.();
    });
    this.moveHelpers.clear();
    this.moveHelperGroup = null;
  }

  emitStatus() {
    this.callbacks.onMoveStatus?.(this.getStatus());
  }

  clear() {
    this.currentRoot = null;
    this.currentVrm = null;
    this.moveRig = null;
    this.moveFootPlants.clear();
    this.moveStatus = null;
    this.move.playing = false;
    this.move.time = 0;
    this.disposeHelpers();
  }
}
