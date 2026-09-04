/**
 * FBX to Keyframe Animation Converter
 * Converts FBX animations to our keyframe format
 */

import * as THREE from 'three';

export class FBXConverter {
  constructor() {
    // Mixamino to VRM bone name mapping
    this.boneMap = {
      'mixaminoHips': 'hips',
      'mixaminoSpine': 'spine',
      'mixaminoSpine1': 'chest',
      'mixaminoSpine2': 'upperChest',
      'mixaminoNeck': 'neck',
      'mixaminoHead': 'head',
      'mixaminoLeftShoulder': 'leftShoulder',
      'mixaminoLeftArm': 'leftUpperArm',
      'mixaminoLeftForeArm': 'leftLowerArm',
      'mixaminoLeftHand': 'leftHand',
      'mixaminoRightShoulder': 'rightShoulder',
      'mixaminoRightArm': 'rightUpperArm',
      'mixaminoRightForeArm': 'rightLowerArm',
      'mixaminoRightHand': 'rightHand',
      'mixaminoLeftUpLeg': 'leftUpperLeg',
      'mixaminoLeftLeg': 'leftLowerLeg',
      'mixaminoLeftFoot': 'leftFoot',
      'mixaminoLeftToeBase': 'leftToe',
      'mixaminoRightUpLeg': 'rightUpperLeg',
      'mixaminoRightLeg': 'rightLowerLeg',
      'mixaminoRightFoot': 'rightFoot',
      'mixaminoRightToeBase': 'rightToe'
    };
  }

  /**
   * Convert FBX animation to keyframe format
   * @param {THREE.AnimationClip} fbxAnimation - FBX animation clip
   * @param {number} sampleRate - How many samples per second (default: 10)
   * @returns {Object} Keyframe animation data
   */
  convertFBXToKeyframe(fbxAnimation, sampleRate = 10) {
    const duration = fbxAnimation.duration;
    const sampleInterval = 1 / sampleRate;
    const keyframes = [];

    console.log(`[FBXConverter] Converting ${fbxAnimation.name} (${duration}s at ${sampleRate}Hz)`);

    // Sample animation at regular intervals
    for (let time = 0; time <= duration; time += sampleInterval) {
      const frame = this.sampleFrameAtTime(fbxAnimation, time);
      if (frame && Object.keys(frame.bones).length > 0) {
        keyframes.push(frame);
      }
    }

    return {
      name: fbxAnimation.name + '_keyframe',
      duration: duration,
      keyframes: keyframes,
      meta: {
        original: 'FBX',
        sampleRate: sampleRate,
        convertedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Sample all bone transforms at specific time
   * @param {THREE.AnimationClip} animation - FBX animation
   * @param {number} time - Time to sample
   * @returns {Object} Frame data with bone transforms
   */
  sampleFrameAtTime(animation, time) {
    const bones = {};

    // Process each animation track
    animation.tracks.forEach(track => {
      const boneName = this.extractBoneName(track.name);
      const vrmBoneName = this.boneMap[boneName];

      if (!vrmBoneName) {
        console.warn(`[FBXConverter] No VRM mapping for bone: ${boneName}`);
        return;
      }

      // Get transform at this time
      const transform = this.evaluateTrackAtTime(track, time);
      if (transform) {
        if (!bones[vrmBoneName]) {
          bones[vrmBoneName] = {};
        }

        // Merge position/rotation data
        Object.assign(bones[vrmBoneName], transform);
      }
    });

    return { time: time, bones: bones };
  }

  /**
   * Extract bone name from track name
   * @param {string} trackName - FBX track name (e.g., "mixaminoHips.position")
   * @returns {string} Bone name (e.g., "mixaminoHips")
   */
  extractBoneName(trackName) {
    return trackName.split('.')[0];
  }

  /**
   * Evaluate track at specific time
   * @param {THREE.KeyframeTrack} track - Animation track
   * @param {number} time - Time to evaluate
   * @returns {Object} Transform data
   */
  evaluateTrackAtTime(track, time) {
    const result = track.evaluate(time);
    
    if (track.name.includes('.position')) {
      return {
        position: [result.x, result.y, result.z]
      };
    } else if (track.name.includes('.quaternion')) {
      return {
        quaternion: [result.x, result.y, result.z, result.w]
      };
    } else if (track.name.includes('.scale')) {
      // Skip scale for now - our format doesn't include it
      return null;
    }

    return null;
  }

  /**
   * Load FBX file and convert all animations
   * @param {string} fbxPath - Path to FBX file
   * @param {number} sampleRate - Sampling rate
   * @returns {Promise<Object[]>} Array of keyframe animations
   */
  async convertFBXFile(fbxPath, sampleRate = 10) {
    const loader = new THREE.FBXLoader();
    
    try {
      const fbx = await loader.loadAsync(fbxPath);
      const animations = [];

      if (fbx.animations && fbx.animations.length > 0) {
        fbx.animations.forEach(fbxAnimation => {
          const keyframeAnimation = this.convertFBXToKeyframe(fbxAnimation, sampleRate);
          animations.push(keyframeAnimation);
        });
      } else {
        console.warn(`[FBXConverter] No animations found in ${fbxPath}`);
      }

      return animations;
    } catch (error) {
      console.error(`[FBXConverter] Failed to load ${fbxPath}:`, error);
      return [];
    }
  }

  /**
   * Save converted animation to file
   * @param {Object} animation - Keyframe animation data
   * @param {string} filename - Output filename
   */
  saveAnimation(animation, filename) {
    const data = JSON.stringify(animation, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    console.log(`[FBXConverter] Saved animation to ${filename}`);
  }

  /**
   * Get available bone mappings
   * @returns {Object} Bone name mapping
   */
  getBoneMapping() {
    return { ...this.boneMap };
  }

  /**
   * Add custom bone mapping
   * @param {string} fbxName - FBX bone name
   * @param {string} vrmName - VRM bone name
   */
  addBoneMapping(fbxName, vrmName) {
    this.boneMap[fbxName] = vrmName;
    console.log(`[FBXConverter] Added mapping: ${fbxName} → ${vrmName}`);
  }
}

// Example usage:
/*
const converter = new FBXConverter();

// Convert FBX file
const animations = await converter.convertFBXFile('/models/dance.fbx', 15);

// Save first animation
if (animations.length > 0) {
  converter.saveAnimation(animations[0], 'dance_keyframe.json');
}
*/
