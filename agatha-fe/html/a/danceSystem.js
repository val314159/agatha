import * as THREE from 'three';

/**
 * Custom Dance Animation System
 * Handles procedural dance animations with height scaling and bone mapping
 */
export class DanceSystem {
  constructor(vrm) {
    this.vrm = vrm;
    this.boneMap = this.createDanceBoneMap();
    this.heightScale = this.calculateHeightScale();
    this.isActive = false;
    this.currentDance = null;
    this.animationTime = 0;
  }

  /**
   * Create bone mapping for dance animations
   * Extends the idle system with dance-specific bones
   */
  createDanceBoneMap() {
    return {
      // Core movement bones
      hips: ['hip', 'hips', 'J_Bip_C_Hips'],
      spine: ['spine', 'J_Bip_C_Spine', 'chest', 'J_Bip_C_Chest'],
      
      // Leg bones for footwork
      leftLeg: ['leg_l', 'thigh_l'],
      rightLeg: ['leg_r', 'thigh_r'],
      leftFoot: ['foot_l', 'ankle_l'],
      rightFoot: ['foot_r', 'ankle_r'],
      
      // Arm bones for upper body movement
      leftArm: ['arm_l', 'shoulder_l'],
      rightArm: ['arm_r', 'shoulder_r'],
      leftForearm: ['forearm_l', 'elbow_l'],
      rightForearm: ['forearm_r', 'elbow_r'],
      
      // Head for expressive movement
      head: ['head', 'J_Bip_C_Head'],
      
      // Eyes for dance expressions
      leftEye: ['adj_l_faceeye', 'eye_l', 'lefteye', 'J_Adj_L_FaceEye'],
      rightEye: ['adj_r_faceeye', 'eye_r', 'righteye', 'J_Adj_R_FaceEye']
    };
  }

  /**
   * Calculate height scale for different VRM models
   * Similar to FBX system but for custom animations
   */
  calculateHeightScale() {
    if (!this.vrm?.humanoid) return 1.0;

    // Get VRM hips height
    const vrmHipsY = this.vrm.humanoid.getNormalizedBoneNode('hips')?.getWorldPosition(new THREE.Vector3()).y || 1.0;
    const vrmRootY = this.vrm.scene.getWorldPosition(new THREE.Vector3()).y;
    const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);

    // Standard reference height (can be adjusted per dance)
    const referenceHeight = 1.0; // 1 meter reference
    
    return vrmHipsHeight / referenceHeight;
  }

  /**
   * Find bones using the mapping system
   */
  findBones() {
    const bones = {};
    
    Object.entries(this.boneMap).forEach(([key, patterns]) => {
      for (const pattern of patterns) {
        const bone = this.vrm.scene.getObjectByName(pattern);
        if (bone) {
          bones[key] = bone;
          break;
        }
      }
    });
    
    return bones;
  }

  /**
   * Disable idle animations during dance
   */
  disableIdleAnimations() {
    if (window.app?.sceneRenderer?.idleAnimationState) {
      window.app.sceneRenderer.idleAnimationState.breathing.active = false;
      window.app.sceneRenderer.idleAnimationState.weightShift.active = false;
      window.app.sceneRenderer.idleAnimationState.head.active = false;
      console.log('[DanceSystem] Idle animations disabled');
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
      console.log('[DanceSystem] Idle animations restored');
    }
  }

  /**
   * Start a dance animation
   */
  startDance(danceName, config = {}) {
    this.isActive = true;
    this.currentDance = danceName;
    this.animationTime = 0;
    
    // Disable idle animations during dance
    this.disableIdleAnimations();
    
    console.log(`[DanceSystem] Starting dance: ${danceName}`);
    console.log(`[DanceSystem] Height scale: ${this.heightScale.toFixed(3)}`);
  }

  /**
   * Stop current dance
   */
  stopDance() {
    this.isActive = false;
    this.currentDance = null;
    
    // Re-enable idle animations
    this.restoreIdleAnimations();
    
    console.log('[DanceSystem] Dance stopped');
  }

  /**
   * Update dance animation
   */
  update(deltaTime) {
    if (!this.isActive || !this.currentDance) return;

    this.animationTime += deltaTime;
    const bones = this.findBones();

    // Apply dance-specific animations
    switch (this.currentDance) {
      case 'basicGroove':
        this.animateBasicGroove(bones, this.animationTime);
        break;
      case 'hipHop':
        this.animateHipHop(bones, this.animationTime);
        break;
      case 'salsa':
        this.animateSalsa(bones, this.animationTime);
        break;
      case 'kpopPoint':
        this.animateKpopPoint(bones, this.animationTime);
        break;
      case 'kpopShoulder':
        this.animateKpopShoulder(bones, this.animationTime);
        break;
      case 'kpopArmWave':
        this.animateKpopArmWave(bones, this.animationTime);
        break;
      default:
        console.warn(`[DanceSystem] Unknown dance: ${this.currentDance}`);
    }
  }

  /**
   * Basic groove dance - simple bouncing movement
   */
  animateBasicGroove(bones, time) {
    const bounce = Math.sin(time * 4) * 0.05 * this.heightScale;
    const sway = Math.sin(time * 2) * 0.02 * this.heightScale;
    
    // Hip bounce
    if (bones.hips) {
      bones.hips.position.y = bounce;
      bones.hips.rotation.x = sway * 0.5;
    }
    
    // Arm sway
    if (bones.leftArm) bones.leftArm.rotation.z = Math.sin(time * 3) * 0.3;
    if (bones.rightArm) bones.rightArm.rotation.z = Math.sin(time * 3 + Math.PI) * 0.3;
    
    // Head movement
    if (bones.head) {
      bones.head.rotation.y = sway * 2;
      bones.head.rotation.z = Math.sin(time * 2) * 0.1;
    }
  }

  /**
   * Hip hop dance - more aggressive movements
   */
  animateHipHop(bones, time) {
    const beat = Math.floor(time * 2) % 4;
    const bounce = Math.sin(time * 8) * 0.08 * this.heightScale;
    
    // Strong hip movement
    if (bones.hips) {
      bones.hips.position.y = bounce;
      bones.hips.rotation.y = Math.sin(time * 4) * 0.1;
    }
    
    // Arm movements
    if (beat === 0) {
      if (bones.leftArm) bones.leftArm.rotation.z = 0.5;
      if (bones.rightArm) bones.rightArm.rotation.z = -0.5;
    } else if (beat === 2) {
      if (bones.leftArm) bones.leftArm.rotation.z = -0.5;
      if (bones.rightArm) bones.rightArm.rotation.z = 0.5;
    }
    
    // Head nodding
    if (bones.head) {
      bones.head.rotation.x = Math.sin(time * 4) * 0.2;
    }
  }

  /**
   * Salsa dance - Latin hip movement
   */
  animateSalsa(bones, time) {
    const hipCircle = Math.sin(time * 3) * 0.03 * this.heightScale;
    const hipSway = Math.cos(time * 3) * 0.04 * this.heightScale;
    
    // Circular hip movement
    if (bones.hips) {
      bones.hips.position.x = hipSway;
      bones.hips.position.y = Math.abs(hipCircle);
      bones.hips.rotation.z = hipCircle * 2;
    }
    
    // Arm positions
    if (bones.leftArm) {
      bones.leftArm.rotation.x = -0.3;
      bones.leftArm.rotation.z = 0.4;
    }
    if (bones.rightArm) {
      bones.rightArm.rotation.x = -0.3;
      bones.rightArm.rotation.z = -0.4;
    }
    
    // Chest movement
    if (bones.spine) {
      bones.spine.rotation.y = Math.sin(time * 6) * 0.05;
    }
  }

  /**
   * K-pop Point dance - iconic finger pointing move
   */
  animateKpopPoint(bones, time) {
    const beat = Math.floor(time * 2) % 4;
    const pointIntensity = (beat === 0) ? 1.0 : 0.3;
    
    // Sharp hip movement on beat
    if (bones.hips) {
      bones.hips.position.y = Math.sin(time * 4) * 0.03 * this.heightScale;
      bones.hips.rotation.y = Math.sin(time * 2) * 0.05;
    }
    
    // Point gesture with right arm
    if (beat === 0) {
      if (bones.rightArm) {
        bones.rightArm.rotation.x = -0.8; // Arm up
        bones.rightArm.rotation.y = -0.3; // Arm forward
        bones.rightArm.rotation.z = 0.2;  // Slight angle
      }
      if (bones.rightForearm) {
        bones.rightForearm.rotation.x = -0.6; // Forearm pointing
      }
    } else {
      // Relaxed position
      if (bones.rightArm) bones.rightArm.rotation.x = -0.2;
      if (bones.rightForearm) bones.rightForearm.rotation.x = -0.1;
    }
    
    // Left arm counter-balance
    if (bones.leftArm) {
      bones.leftArm.rotation.z = Math.sin(time * 3) * 0.2 * pointIntensity;
    }
    
    // Head accent
    if (bones.head) {
      bones.head.rotation.y = Math.sin(time * 2) * 0.1 * pointIntensity;
    }
  }

  /**
   * K-pop Shoulder dance - sharp shoulder movements
   */
  animateKpopShoulder(bones, time) {
    const beat = Math.floor(time * 2) % 4;
    const shoulderMove = (beat === 1 || beat === 3) ? 1.0 : 0.0;
    
    // Subtle hip bounce
    if (bones.hips) {
      bones.hips.position.y = Math.sin(time * 4) * 0.02 * this.heightScale;
    }
    
    // Sharp shoulder movements
    if (beat === 1) {
      // Left shoulder up
      if (bones.leftArm) {
        bones.leftArm.rotation.x = -0.4;
        bones.leftArm.rotation.z = 0.3;
      }
      if (bones.rightArm) {
        bones.rightArm.rotation.x = -0.1;
        bones.rightArm.rotation.z = -0.1;
      }
    } else if (beat === 3) {
      // Right shoulder up
      if (bones.rightArm) {
        bones.rightArm.rotation.x = -0.4;
        bones.rightArm.rotation.z = -0.3;
      }
      if (bones.leftArm) {
        bones.leftArm.rotation.x = -0.1;
        bones.leftArm.rotation.z = 0.1;
      }
    } else {
      // Neutral position
      if (bones.leftArm) bones.leftArm.rotation.x = -0.2;
      if (bones.rightArm) bones.rightArm.rotation.x = -0.2;
    }
    
    // Chest pop on shoulder moves
    if (bones.spine && shoulderMove) {
      bones.spine.rotation.z = Math.sin(time * 8) * 0.05;
    }
    
    // Head follow
    if (bones.head) {
      bones.head.rotation.y = Math.sin(time * 2) * 0.08;
    }
  }

  /**
   * K-pop Arm Wave - smooth flowing arm movements
   */
  animateKpopArmWave(bones, time) {
    const wavePhase = time * 2;
    
    // Gentle hip sway
    if (bones.hips) {
      bones.hips.position.y = Math.sin(time * 3) * 0.02 * this.heightScale;
      bones.hips.rotation.y = Math.sin(wavePhase) * 0.03;
    }
    
    // Flowing arm wave - left arm leads
    if (bones.leftArm) {
      bones.leftArm.rotation.x = -0.3 + Math.sin(wavePhase) * 0.2;
      bones.leftArm.rotation.z = Math.sin(wavePhase + Math.PI/2) * 0.4;
    }
    if (bones.leftForearm) {
      bones.leftForearm.rotation.x = -0.2 + Math.sin(wavePhase + Math.PI/4) * 0.3;
    }
    
    // Flowing arm wave - right arm follows
    if (bones.rightArm) {
      bones.rightArm.rotation.x = -0.3 + Math.sin(wavePhase - Math.PI/2) * 0.2;
      bones.rightArm.rotation.z = Math.sin(wavePhase - Math.PI) * 0.4;
    }
    if (bones.rightForearm) {
      bones.rightForearm.rotation.x = -0.2 + Math.sin(wavePhase - Math.PI/4) * 0.3;
    }
    
    // Elegant head movement
    if (bones.head) {
      bones.head.rotation.y = Math.sin(wavePhase * 0.5) * 0.1;
      bones.head.rotation.z = Math.sin(wavePhase * 0.7) * 0.05;
    }
    
    // Subtle chest movement
    if (bones.spine) {
      bones.spine.rotation.y = Math.sin(wavePhase * 0.8) * 0.03;
    }
  }

  /**
   * Get available dances
   */
  getAvailableDances() {
    return ['basicGroove', 'hipHop', 'salsa', 'kpopPoint', 'kpopShoulder', 'kpopArmWave'];
  }

  /**
   * Get system info
   */
  getInfo() {
    return {
      isActive: this.isActive,
      currentDance: this.currentDance,
      heightScale: this.heightScale,
      availableDances: this.getAvailableDances(),
      bonesFound: Object.keys(this.findBones()).length
    };
  }
}
