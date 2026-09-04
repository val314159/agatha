import * as THREE from 'three';
import { SampleAnimations } from './danceData.js';

/**
 * Keyframe Dance Animation System
 * Handles frame-based dance animations using VRM normalized bones
 * Uses local space transforms: position offset + quaternion rotation from bind pose
 */
export class DanceFrameSystem {
  constructor(vrm) {
    this.vrm = vrm;
    this.currentAnimation = null;
    this.currentTime = 0;
    this.isActive = false;
    this.loop = true;
    
    // Store original bone positions for local space transforms
    this.originalPositions = new Map();
    this.originalRotations = new Map();
  }

  /**
   * Load a keyframe animation
   * @param {Object} animationData - Animation with compact keyframes
   */
  loadAnimation(animationData) {
    this.currentAnimation = this.preprocessAnimation(animationData);
    this.currentTime = 0;
    console.log(`[DanceFrames] Loaded animation: ${animationData.name}`);
  }

  /**
   * Preprocess animation for better performance
   * Cache bone objects and store original positions
   */
  preprocessAnimation(animationData) {
    const processed = {
      ...animationData,
      boneCache: {},
      keyframes: animationData.keyframes.sort((a, b) => a.time - b.time)
    };

    // Cache VRM bone objects and store original positions
    processed.keyframes.forEach(keyframe => {
      Object.keys(keyframe.bones).forEach(boneName => {
        if (!processed.boneCache[boneName]) {
          const boneWrapper = this.vrm.humanoid.getNormalizedBone(boneName);
          if (boneWrapper && boneWrapper.node) {
            const bone = boneWrapper.node;
            processed.boneCache[boneName] = bone;
            
            // Store original bind pose positions (only once per bone)
            if (!this.originalPositions.has(boneName)) {
              this.originalPositions.set(boneName, bone.position.clone());
              this.originalRotations.set(boneName, bone.quaternion.clone());
            }
          }
        }
      });
    });

    console.log(`[DanceFrames] Cached ${Object.keys(processed.boneCache).length} bones`);
    return processed;
  }

  /**
   * Start animation playback
   */
  start() {
    if (!this.currentAnimation) {
      console.error('[DanceFrames] No animation loaded');
      return;
    }
    
    this.isActive = true;
    this.currentTime = 0;
    
    // Disable idle animations
    this.disableIdleAnimations();
    
    console.log('[DanceFrames] Animation started');
  }

  /**
   * Stop animation playback
   */
  stop() {
    this.isActive = false;
    
    // Restore idle animations
    this.restoreIdleAnimations();
    
    console.log('[DanceFrames] Animation stopped');
  }

  /**
   * Update animation frame
   * @param {number} deltaTime - Time since last frame
   */
  update(deltaTime) {
    if (!this.isActive || !this.currentAnimation) return;

    this.currentTime += deltaTime;
    
    // Handle looping
    if (this.currentTime > this.currentAnimation.duration) {
      if (this.loop) {
        this.currentTime = this.currentTime % this.currentAnimation.duration;
      } else {
        this.stop();
        return;
      }
    }

    // Find and apply current frame
    const frameData = this.interpolateFrames(this.currentTime);
    this.applyFrame(frameData);
  }

  /**
   * Find surrounding keyframes and interpolate
   * @param {number} time - Current animation time
   * @returns {Object} Interpolated bone transforms
   */
  interpolateFrames(time) {
    const keyframes = this.currentAnimation.keyframes;
    
    // Find surrounding keyframes
    let prevKeyframe = keyframes[0];
    let nextKeyframe = keyframes[keyframes.length - 1];
    
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
        prevKeyframe = keyframes[i];
        nextKeyframe = keyframes[i + 1];
        break;
      }
    }
    
    // Calculate interpolation factor
    const segmentDuration = nextKeyframe.time - prevKeyframe.time;
    const t = segmentDuration > 0 ? (time - prevKeyframe.time) / segmentDuration : 0;
    
    // Interpolate bone transforms using compact arrays
    const interpolatedFrame = {};
    Object.keys(prevKeyframe.bones).forEach(boneName => {
      const prevArray = prevKeyframe.bones[boneName];
      const nextArray = nextKeyframe.bones[boneName] || prevArray;
      
      interpolatedFrame[boneName] = this.interpolateArray(prevArray, nextArray, t);
    });
    
    return interpolatedFrame;
  }

  /**
   * Interpolate between two bone data objects with easing support
   * @param {Object} boneData1 - First bone data {position: [...], quaternion: [...]}
   * @param {Object} boneData2 - Second bone data
   * @param {number} t - Interpolation factor (0-1)
   * @returns {Object} Interpolated bone data
   */
  interpolateArray(boneData1, boneData2, t) {
    // Get easing type for this interpolation
    const easingType = this.getEasingType(boneData1, boneData2);
    
    // Apply easing to time factor
    const easedT = this.applyEasing(t, easingType);
    
    // Linear interpolation for position
    const pos1 = boneData1.position;
    const pos2 = boneData2.position;
    const posX = pos1[0] + (pos2[0] - pos1[0]) * easedT;
    const posY = pos1[1] + (pos2[1] - pos1[1]) * easedT;
    const posZ = pos1[2] + (pos2[2] - pos1[2]) * easedT;
    
    // Spherical interpolation for quaternion
    const quat1 = new THREE.Quaternion(...boneData1.quaternion);
    const quat2 = new THREE.Quaternion(...boneData2.quaternion);
    const result = quat1.clone().slerp(quat2, easedT);
    
    return {
      position: [posX, posY, posZ],
      quaternion: [result.x, result.y, result.z, result.w]
    };
  }

  /**
   * Apply interpolated frame to VRM bones using local space transforms
   * @param {Object} frameData - Bone transforms to apply
   */
  applyFrame(frameData) {
    Object.entries(frameData).forEach(([boneName, boneData]) => {
      const bone = this.currentAnimation.boneCache[boneName];
      if (!bone || !boneData.position || !boneData.quaternion) return;
      
      // Get original bind pose
      const originalPos = this.originalPositions.get(boneName);
      const originalQuat = this.originalRotations.get(boneName);
      
      if (!originalPos || !originalQuat) {
        console.warn(`[DanceFrames] No original pose stored for ${boneName}`);
        return;
      }
      
      // Apply local space transforms
      const [posX, posY, posZ] = boneData.position;
      const [quatX, quatY, quatZ, quatW] = boneData.quaternion;
      
      // Position: Original + local offset
      bone.position.set(
        originalPos.x + posX,
        originalPos.y + posY,
        originalPos.z + posZ
      );
      
      // Rotation: Original * local rotation
      const localQuat = new THREE.Quaternion(quatX, quatY, quatZ, quatW);
      bone.quaternion.copy(originalQuat).multiply(localQuat);
    });
  }

  /**
   * Get easing type for bone interpolation
   * @param {Object} boneData1 - First bone data
   * @param {Object} boneData2 - Second bone data
   * @returns {string} Easing type
   */
  getEasingType(boneData1, boneData2) {
    // Check per-bone easing first
    if (boneData1.easing) return boneData1.easing;
    if (boneData2.easing) return boneData2.easing;
    
    // Fall back to global easing
    return this.currentAnimation.easing || 'linear';
  }

  /**
   * Apply easing function to time factor
   * @param {number} t - Time factor (0-1)
   * @param {string} easingType - Type of easing
   * @returns {number} Eased time factor
   */
  applyEasing(t, easingType) {
    switch (easingType) {
      case 'linear':
        return this.linear(t);
      case 'easeIn':
        return this.easeInQuad(t);
      case 'easeOut':
        return this.easeOutQuad(t);
      case 'easeInOut':
        return this.easeInOutQuad(t);
      case 'easeInCubic':
        return this.easeInCubic(t);
      case 'easeOutCubic':
        return this.easeOutCubic(t);
      case 'easeInOutCubic':
        return this.easeInOutCubic(t);
      case 'bounce':
        return this.bounce(t);
      default:
        return t;
    }
  }

  /**
   * Easing functions
   */
  linear(t) {
    return t;
  }

  easeInQuad(t) {
    return t * t;
  }

  easeOutQuad(t) {
    return t * (2 - t);
  }

  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  easeInCubic(t) {
    return t * t * t;
  }

  easeOutCubic(t) {
    return (--t) * t * t + 1;
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }

  bounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }

  /**
   * Disable idle animations during dance
   */
  disableIdleAnimations() {
    if (window.app?.sceneRenderer?.idleAnimationState) {
      window.app.sceneRenderer.idleAnimationState.breathing.active = false;
      window.app.sceneRenderer.idleAnimationState.weightShift.active = false;
      window.app.sceneRenderer.idleAnimationState.head.active = false;
    }
  }

  /**
   * Restore idle animations after dance
   */
  restoreIdleAnimations() {
    if (window.app?.sceneRenderer?.idleAnimationState) {
      window.app.sceneRenderer.idleAnimationState.breathing.active = true;
      window.app.sceneRenderer.idleAnimationState.weightShift.active = true;
      window.app.sceneRenderer.idleAnimationState.head.active = true;
    }
  }

  /**
   * Get available animations
   */
  getAvailableAnimations() {
    return [
      'kpopPointKeyframe',
      'basicGrooveKeyframe',
      'hipHopKeyframe',
      'salsaKeyframe',
      'kpopShoulderKeyframe',
      'kpopArmWaveKeyframe'
    ];
  }

  /**
   * Get system info
   */
  getInfo() {
    return {
      isActive: this.isActive,
      currentAnimation: this.currentAnimation?.name || null,
      currentTime: this.currentTime.toFixed(2),
      duration: this.currentAnimation?.duration || 0,
      cachedBones: Object.keys(this.currentAnimation?.boneCache || {}).length
    };
  }

  /**
   * Reset all bones to neutral/bind pose
   */
  resetToNeutral() {
    if (!this.currentAnimation) {
      console.warn('[DanceFrames] No animation loaded, cannot reset to neutral');
      return;
    }

    // Reset all cached bones to original bind pose
    Object.entries(this.currentAnimation.boneCache).forEach(([boneName, bone]) => {
      if (bone) {
        const originalPos = this.originalPositions.get(boneName);
        const originalQuat = this.originalRotations.get(boneName);
        
        if (originalPos && originalQuat) {
          // Restore to original bind pose
          bone.position.copy(originalPos);
          bone.quaternion.copy(originalQuat);
        }
      }
    });

    // Stop any current animation
    this.stop();
    
    console.log('[DanceFrames] Reset all bones to neutral pose');
  }
}

/**
 * Sample keyframe animations using compact array format
 * Format: [posX, posY, posZ, quatX, quatY, quatZ, quatW]
 * Uses VRM normalized bone names for maximum compatibility
 * NOTE: Animation data moved to danceData.js for better organization
 */
