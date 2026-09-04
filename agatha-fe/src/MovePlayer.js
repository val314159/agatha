import * as THREE from 'three';
import { createAnimationClip } from './playableAnimation.js';

export class MovePlayer {
  constructor(root) {
    this.root = root;
    this.mixer = null;
    this.clip = null;
    this.action = null;
    this.timeScale = 0.6;
  }

  setRoot(root) {
    this.stop();
    this.root = root;
  }

  setTimeScale(scale) {
    this.timeScale = scale;
    if (this.action) {
      this.action.setEffectiveTimeScale(scale);
    }
  }

  getStatus() {
    if (!this.action) return { playing: false, time: 0, duration: 0 };
    return {
      playing: this.action.isRunning(),
      time: this.action.time,
      duration: this.clip?.duration || 0,
    };
  }

  play(avar) {
    this.stop();
    if (!avar?.tracks?.length || !this.root) return;

    this.clip = createAnimationClip(avar);
    if (this.clip.tracks.length === 0) return;

    this.mixer = new THREE.AnimationMixer(this.root);
    this.action = this.mixer.clipAction(this.clip);
    this.action.setEffectiveTimeScale(this.timeScale);
    this.action.play();
  }

  stop() {
    if (this.action) {
      this.action.stop();
      this.action = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.clip = null;
  }

  update(delta) {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }
}
