import * as THREE from 'three';
import { DanceFrameSystem } from './danceFormat.js';

// Utility: smooth oscillation
const getSmooth = (phase, freq, t) => Math.sin((t * freq + phase) * Math.PI * 2);

// Utility: find bones by pattern
function findBones(vrm, patterns) {
  const bones = {};
  const allBones = []; // Store all bone names for debugging
  if (!vrm?.scene) return bones;
  vrm.scene.traverse(obj => {
    if (!obj.isBone) return;
    allBones.push({ name: obj.name, parent: obj.parent?.name || 'ROOT' });
    for (const [k, pats] of Object.entries(patterns)) {
      const patterns = Array.isArray(pats) ? pats : [pats];
      for (const pat of patterns) {
        if (obj.name.toLowerCase().includes(pat.toLowerCase())) {
          bones[k] = obj;
          break; // Found this bone type, move to next
        }
      }
    }
  });
  bones._allBones = allBones; // Store for debugging
  return bones;
}

export function initializeAnimations(app) {
  console.log('Initializing animations...');
  
  // Initialize avatar bones - try both pattern sets in single traversal
  app.avatarBones = findBones(app.currentVRM, {
    head: ['head', 'J_Bip_C_Head'], 
    neck: ['neck', 'J_Bip_C_Neck'], 
    spine: ['spine', 'J_Bip_C_Spine', 'chest', 'J_Bip_C_Chest'], 
    hips: ['hip', 'hips', 'J_Bip_C_Hips'],
    leftArm: ['arm_l', 'shoulder_l'], 
    rightArm: ['arm_r', 'shoulder_r'], 
    leftForearm: ['forearm_l', 'elbow_l'], 
    rightForearm: ['forearm_r', 'elbow_r'], 
    leftHand: ['hand_l', 'wrist_l'], 
    rightHand: ['hand_r', 'wrist_r'],
    leftLeg: ['leg_l', 'thigh_l'], 
    rightLeg: ['leg_r', 'thigh_r'], 
    leftFoot: ['foot_l', 'ankle_l'], 
    rightFoot: ['foot_r', 'ankle_r'],
    leftEye: ['adj_l_faceeye', 'eye_l', 'lefteye', 'J_Adj_L_FaceEye'], 
    rightEye: ['adj_r_faceeye', 'eye_r', 'righteye', 'J_Adj_R_FaceEye']
  });
/*  
  console.log('Found avatar bones:', Object.keys(app.avatarBones));
  console.log('Bone details:');
  Object.entries(app.avatarBones).forEach(([key, bone]) => {
    if (bone) {
      console.log(`  ${key}: "${bone.name}" (parent: ${bone.parent?.name || 'ROOT'})`);
    } else {
      console.log(`  ${key}: NOT FOUND`);
    }
  });
  
  // Log all available bones for debugging
  if (app.avatarBones._allBones) {
    console.log('All bones in VRM:');
    app.avatarBones._allBones.forEach(bone => {
      console.log(`  ${bone.name} (parent: ${bone.parent})`);
    });
  }
  */

  // Initialize idle animation states
  const s = app.sceneRenderer.idleAnimationState;
  
  // Initialize head turn state (defaults to OFF)
  console.log('[animate] Initializing headTurn state');
  s.headTurn = {
    phase: 0,
    frequency: 0.15,
    amplitude: THREE.MathUtils.degToRad(15),
    active: false,
    lastActiveTime: 0
  };
  
  const now = app.clock.getElapsedTime();

  // Initialize eye dart state
  s.head.nextEyeDartTime = app.clock.getElapsedTime() + 0.5 + Math.random() * 1.0; // 0.5-1.5s initial delay (faster start)
  
  // Store the natural resting position of eyes as "center"
  if (app.avatarBones.leftEye && app.avatarBones.rightEye) {
    s.head.eyeCenterY = app.avatarBones.leftEye.rotation.y || 0;
    s.head.eyeCenterX = app.avatarBones.leftEye.rotation.x || 0;
    console.log('[animate] Eye center position - Y:', s.head.eyeCenterY.toFixed(4), 'X:', s.head.eyeCenterX.toFixed(4));
  }
  
  console.log('[animate] Eye dart initialized, first dart in 2-5s');
  
  // Initialize glance state
  s.head.nextLookTime = now + 3.0 + Math.random() * 4.0; // 3-7s initial delay (clock time)
  console.log('[animate] Glance state initialized, first glance in 3-7s');
  
  // Initialize DanceFrameSystem for keyframe animations
  if (app.currentVRM) {
    console.log('[animate] Initializing DanceFrameSystem...');
    app.danceFrameSystem = new DanceFrameSystem(app.currentVRM);
    console.log('[animate] DanceFrameSystem initialized successfully');
  } else {
    console.warn('[animate] No VRM available for DanceFrameSystem initialization');
  }
  
}

// Animate idle states that run BEFORE vrm.update (VRM API calls)
export function animateIdleStates(app) {
  const now = app.clock.getElapsedTime();
  app.blinker.update(now * 1000, app.currentVRM);
  const b = app.avatarBones, s = app.sceneRenderer.idleAnimationState;
  
  // VRM API calls must go before vrm.update()
  if (s.headTurn?.active && b?.head && app.currentVRM?.humanoid) {
    // Head turn takes priority
    const headAngle = getSmooth(s.headTurn.phase, s.headTurn.frequency, app.clock.getElapsedTime()) * s.headTurn.amplitude;
    const headBoneWrapper = app.currentVRM.humanoid.getNormalizedBone('head'); // Use correct API
    if (headBoneWrapper && headBoneWrapper.node) {
      const headBone = headBoneWrapper.node; // Get the actual bone from the wrapper
      headBone.rotation.y = headAngle;
    }
  } else {
    // Only run nod/glance when head turn is off
    animateHeadNod(app, b, s);
    animateHeadGlance(app, b, s);
  }
  
  // Eye darts can always run (they don't conflict with head movements)
  animateEyeDart(app, b, s);
  
  // Other idle animations (breathing, weight shift, etc.)
if (s.breathing.active && b.spine)
  b.spine.rotation.x = THREE.MathUtils.lerp(b.spine.rotation.x || 0, getSmooth(s.breathing.phase, s.breathing.frequency, now) * s.breathing.amplitude, 0.1);
if (s.weightShift.active && b.hips) {
  const ws = getSmooth(s.weightShift.phase, s.weightShift.frequency, now);
  b.hips.position.x = THREE.MathUtils.lerp(b.hips.position.x || 0, ws * s.weightShift.amplitude, 0.05);
  if (performance.now() > s.weightShift.nextChangeTime) {
    s.weightShift.phase = Math.random() * Math.PI * 2;
    s.weightShift.nextChangeTime = performance.now() + 5000 + Math.random() * 5000;
  }
}
if (s.arms.active) {
  if (b.leftArm)
    b.leftArm.rotation.z = THREE.MathUtils.lerp(b.leftArm.rotation.z || 0, getSmooth(s.arms.leftPhase, s.arms.frequency, now) * s.arms.amplitude, 0.05);
  if (b.rightArm)
    b.rightArm.rotation.z = THREE.MathUtils.lerp(b.rightArm.rotation.z || 0, -getSmooth(s.arms.rightPhase, s.arms.frequency, now) * s.arms.amplitude, 0.05);
}
if (b.leftLeg && b.rightLeg) {
    const ws = getSmooth(s.weightShift.phase, s.weightShift.frequency, now);
    b.leftLeg.rotation.z = THREE.MathUtils.lerp(b.leftLeg.rotation.z || 0, -ws * s.weightShift.amplitude * 0.5, 0.05);
    b.rightLeg.rotation.z = THREE.MathUtils.lerp(b.rightLeg.rotation.z || 0, ws * s.weightShift.amplitude * 0.5, 0.05);
  }
  if (s.fingers.active) {
      const wiggle = getSmooth(s.fingers.phase, s.fingers.frequency, now) * s.fingers.amplitude;
      if (b.leftHand)  b.leftHand.rotation.x = THREE.MathUtils.lerp(b.leftHand.rotation.x || 0, wiggle, 0.1);
      if (b.rightHand) b.rightHand.rotation.x = THREE.MathUtils.lerp(b.rightHand.rotation.x || 0, -wiggle, 0.1);
  }
}

// Animate lipsync for VRM/jaw/blendshapes
export function animateLipSync(app) {
  const now = performance.now();
  let mouthValue = 0;
  if (app.lipSync && app.lipSync.active)
    mouthValue = Math.abs(Math.sin((now - app.lipSync.startTime) / 1000 * 8));
  else if (app.lipSync && now < app.lipSync.endTime + app.lipSync.fadeOutDuration) {
    const fade = (now - app.lipSync.endTime) / app.lipSync.fadeOutDuration;
    mouthValue = Math.abs(Math.sin((app.lipSync.endTime - app.lipSync.startTime) / 1000 * 8)) * (1 - fade);
  }
  if (app.lipSync?.jawBone)
    app.lipSync.jawBone.rotation.x = -1.0 * mouthValue;
  const exprMgr = app.currentVRM?.expressionManager || app.currentVRM?.expressions;
  if (exprMgr) {
    if (app.lipSync?.mouthExpressionKey)
      typeof exprMgr.setValue === 'function'
    ? exprMgr.setValue(app.lipSync.mouthExpressionKey, mouthValue)
    : exprMgr.expressions?.[app.lipSync.mouthExpressionKey] && (exprMgr.expressions[app.lipSync.mouthExpressionKey].weight = mouthValue);
    if (app.lipSync?.mouthWidenKey)
      typeof exprMgr.setValue === 'function'
    ? exprMgr.setValue(app.lipSync.mouthWidenKey, mouthValue)
    : exprMgr.expressions?.[app.lipSync.mouthWidenKey] && (exprMgr.expressions[app.lipSync.mouthWidenKey].weight = mouthValue);
  }
  if (app.currentVRM?.blendShapeProxy) {
    if (app.lipSync?.mouthExpressionKey) app.currentVRM.blendShapeProxy.setValue(app.lipSync.mouthExpressionKey, mouthValue);
    if (app.lipSync?.mouthWidenKey) app.currentVRM.blendShapeProxy.setValue(app.lipSync.mouthWidenKey, mouthValue);
  }
}

// Animate idle states that run AFTER vrm.update (direct bone edits only)
export function animateIdleStatesPostUpdate(app) {
  if (!app.sceneRenderer.idleAnimationState) return;
  const b = app.avatarBones, s = app.sceneRenderer.idleAnimationState;

  // Only direct bone manipulation here (VRM API calls are in pre-update)
  // Currently empty - all VRM API calls moved to animateIdleStates()
}

function animateHeadTurn(app, b, s) {  
  // Apply procedural head turn using VRM pose system
  if (s.headTurn?.active && b?.head && app.currentVRM?.humanoid) {
    const headAngle = getSmooth(s.headTurn.phase, s.headTurn.frequency, app.clock.getElapsedTime()) * s.headTurn.amplitude;
    
    // Use VRM humanoid system (consistent with other animations)
    const headBoneWrapper = app.currentVRM.humanoid.getNormalizedBone('head');
    if (headBoneWrapper && headBoneWrapper.node) {
      const headBone = headBoneWrapper.node;
      headBone.rotation.y = headAngle;
    }
  }
}

// Head nod animation (continuous smooth up/down motion)
function animateHeadNod(app, b, s) {
  if (!b?.head || !app.currentVRM?.humanoid) return; // Guard against missing bones
  
  const now = app.clock.getElapsedTime();
  
  // Use VRM humanoid system for proper bone manipulation
  const headBoneWrapper = app.currentVRM.humanoid.getNormalizedBone('head');
  if (!headBoneWrapper || !headBoneWrapper.node) {
    console.log('[animate] Head bone not found in humanoid system for nod');
    return;
  }
  
  const headBone = headBoneWrapper.node;
  headBone.rotation.x = THREE.MathUtils.lerp(
    headBone.rotation.x || 0,
    getSmooth(s.head.phase, s.head.frequency, now) * s.head.amplitude * 1.75,
    0.05
  );
}

// Eye dart animation (simple algorithm like glances)
function animateEyeDart(app, b, s) {
  // Use VRM humanoid system for eye bones instead of direct bone manipulation
  if (!app.currentVRM?.humanoid) {
    console.log('[animate] VRM humanoid system not available');
    return;
  }
  
  const leftEyeWrapper = app.currentVRM.humanoid.getNormalizedBone('leftEye');
  const rightEyeWrapper = app.currentVRM.humanoid.getNormalizedBone('rightEye');
  
  if (!leftEyeWrapper || !leftEyeWrapper.node || !rightEyeWrapper || !rightEyeWrapper.node) {
    console.log('[animate] Eye bones not found in humanoid system - leftEye:', !!leftEyeWrapper, 'rightEye:', !!rightEyeWrapper);
    return;
  }
  
  const leftEye = leftEyeWrapper.node;
  const rightEye = rightEyeWrapper.node;
  
  const now = app.clock.getElapsedTime();
  
  // Start new dart when it's time
  if (now > s.head.nextEyeDartTime && !s.head.eyeDartStartTime) {
    // Get the natural center from VRM humanoid eye bones (not the old raw bones)
    if (!s.head.eyeCenterY || !s.head.eyeCenterX) {
      s.head.eyeCenterY = leftEye.rotation.y || 0;
      s.head.eyeCenterX = leftEye.rotation.x || 0;
      console.log('[animate] Eye center from VRM humanoid - Y:', s.head.eyeCenterY.toFixed(4), 'X:', s.head.eyeCenterX.toFixed(4));
    } else {
      // Always update center from current VRM position in case it changes
      s.head.eyeCenterY = leftEye.rotation.y || 0;
      s.head.eyeCenterX = leftEye.rotation.x || 0;
    }
    
    // Human-like eye movement patterns
    const horizontalBias = Math.random() > 0.3; // 70% horizontal, 30% vertical
    const outwardBias = Math.random() > 0.4; // 60% outward, 40% inward
    
    let targetOffsetY, targetOffsetX;
    
    if (horizontalBias) {
      // Horizontal movement (left/right) - smaller range
      targetOffsetY = (outwardBias ? 1 : -1) * (0.008 + Math.random() * 0.012); // ±1.1° (half size)
      targetOffsetX = (Math.random() - 0.5) * 0.005; // Small vertical component ±0.3° (half size)
    } else {
      // Vertical movement (up/down) - smaller range  
      targetOffsetY = (Math.random() - 0.5) * 0.008; // Small horizontal ±0.4° (half size)
      targetOffsetX = (outwardBias ? 1 : -1) * (0.004 + Math.random() * 0.006); // ±0.5° (half size)
    }
    
    // Apply offsets to natural center from VRM humanoid
    s.head.eyeDartTargetY = s.head.eyeCenterY + targetOffsetY;
    s.head.eyeDartTargetX = s.head.eyeCenterX + targetOffsetX;
    s.head.eyeDartStartY = s.head.eyeCenterY || 0;
    s.head.eyeDartStartX = s.head.eyeCenterX || 0;
    s.head.eyeDartStartTime = now;
    
    // Human-like timing variations (slower darts)
    s.head.eyeDartDuration = 0.12 + Math.random() * 0.16; // 120-280ms (2x slower)
    s.head.eyeDartHoldTime = 0.16 + Math.random() * 0.24; // 160-400ms hold (2x slower)
    s.head.eyeDartReturnDuration = 0.08 + Math.random() * 0.12; // 80-200ms return (2x slower)
    s.head.eyeDartTotalDuration = s.head.eyeDartDuration + s.head.eyeDartHoldTime + s.head.eyeDartReturnDuration;
    
    // Variable intervals - more natural rhythm (very infrequent)
    const intervalMultiplier = horizontalBias ? 1.0 : 1.3; // Longer pause after vertical movement
    s.head.nextEyeDartTime = now + s.head.eyeDartTotalDuration + (2.0 + Math.random() * 4.0) * intervalMultiplier; // 2.0-6.0s between darts (natural)
    
    console.log('[animate] Human dart - Y:', s.head.eyeDartTargetY.toFixed(4), 'X:', s.head.eyeDartTargetX.toFixed(4), 'type:', horizontalBias ? 'H' : 'V');
    console.log('[animate] Eye bones from humanoid - leftEye:', leftEye.name, 'rightEye:', rightEye.name);
    console.log('[animate] Current eye rotations - leftY:', leftEye.rotation.y.toFixed(4), 'leftX:', leftEye.rotation.x.toFixed(4));
  }
  
  // Only animate if we have an active dart
  if (!s.head.eyeDartStartTime) {
    // No dart started yet, leave eyes alone
    return;
  }
  
  // Calculate progress through dart cycle
  const elapsed = now - s.head.eyeDartStartTime;
  
  if (elapsed < s.head.eyeDartDuration) {
    // Darting out
    const t = elapsed / s.head.eyeDartDuration
    const easeT = t * t * (3.0 - 2.0 * t); // Smooth ease-in-out
    leftEye.rotation.y = THREE.MathUtils.lerp(s.head.eyeDartStartY, s.head.eyeDartTargetY, easeT);
    rightEye.rotation.y = THREE.MathUtils.lerp(s.head.eyeDartStartY, s.head.eyeDartTargetY, easeT);
    leftEye.rotation.x = THREE.MathUtils.lerp(s.head.eyeDartStartX, s.head.eyeDartTargetX, easeT);
    rightEye.rotation.x = THREE.MathUtils.lerp(s.head.eyeDartStartX, s.head.eyeDartTargetX, easeT);
    
    // Debug: Log actual rotations being applied
    if (Math.random() < 0.01) { // Only log 1% of the time to avoid spam
      console.log('[animate] Applying eye rotations - leftY:', leftEye.rotation.y.toFixed(4), 'leftX:', leftEye.rotation.x.toFixed(4), 'targetY:', s.head.eyeDartTargetY.toFixed(4));
    }
  } else if (elapsed < s.head.eyeDartDuration + s.head.eyeDartHoldTime) {
    // Holding at target
    leftEye.rotation.y = s.head.eyeDartTargetY;
    rightEye.rotation.y = s.head.eyeDartTargetY;
    leftEye.rotation.x = s.head.eyeDartTargetX;
    rightEye.rotation.x = s.head.eyeDartTargetX;
  } else if (elapsed < s.head.eyeDartTotalDuration) {
    // Returning to natural center
    const returnElapsed = elapsed - s.head.eyeDartDuration - s.head.eyeDartHoldTime;
    const t = returnElapsed / s.head.eyeDartReturnDuration;
    const easeT = t * t * (3.0 - 2.0 * t); // Smooth ease-in-out
    leftEye.rotation.y = THREE.MathUtils.lerp(s.head.eyeDartTargetY, s.head.eyeCenterY || 0, easeT);
    rightEye.rotation.y = THREE.MathUtils.lerp(s.head.eyeDartTargetY, s.head.eyeCenterY || 0, easeT);
    leftEye.rotation.x = THREE.MathUtils.lerp(s.head.eyeDartTargetX, s.head.eyeCenterX || 0, easeT);
    rightEye.rotation.x = THREE.MathUtils.lerp(s.head.eyeDartTargetX, s.head.eyeCenterX || 0, easeT);
    
    // Debug: Log return progress
    if (Math.random() < 0.01) { // Only log 1% of the time to avoid spam
      console.log('[animate] Returning to center - progress:', (t * 100).toFixed(0) + '%', 'leftY:', leftEye.rotation.y.toFixed(4), 'centerY:', s.head.eyeCenterY.toFixed(4));
    }
  } else {
    // Dart complete, reset to natural center for next dart
    leftEye.rotation.y = s.head.eyeCenterY || 0;
    rightEye.rotation.y = s.head.eyeCenterY || 0;
    leftEye.rotation.x = s.head.eyeCenterX || 0;
    rightEye.rotation.x = s.head.eyeCenterX || 0;
    s.head.eyeDartStartTime = null; // Reset to allow next dart
    
    console.log('[animate] zDart complete - reset to center Y:', s.head.eyeCenterY.toFixed(4), 'X:', s.head.eyeCenterX.toFixed(4));
  }
/*  
  // Update matrices only when animating
  leftEye.updateMatrix();
  leftEye.updateMatrixWorld();
  rightEye.updateMatrix();
  rightEye.updateMatrixWorld();
  */
}

// Head glance animation (larger head turns)
function animateHeadGlance(app, b, s) {
  if (!b?.head || !app.currentVRM?.humanoid) return; // Guard against missing bones
  
  const perfNow = app.clock.getElapsedTime(); // Use clock for smooth timing
  
  // Start new glance when it's time AND previous cycle is complete
  if (perfNow > s.head.nextLookTime && !s.head.glanceInProgress) {
    s.head.glanceTarget = (Math.random() - 0.5) * 0.05; // ±0.05 radians = ±3° (10x larger for testing)
    s.head.glanceStartTime = perfNow; // Clock time
    s.head.glanceDuration = 0.4 + Math.random() * 0.4; // 400-800ms to reach target (clock time)
    s.head.holdDuration = 0.2 + Math.random() * 1.8; // 200-2000ms hold (clock time)
    s.head.returnDuration = 0.2 + Math.random() * 0.3; // 200-500ms return (clock time)
    s.head.glanceInProgress = true;
    s.head.nextLookTime = perfNow + s.head.glanceDuration + s.head.holdDuration + s.head.returnDuration + 3.0 + Math.random() * 4.0; // 3-7s between glances (clock time)
    console.log('[animate] New glance target:', s.head.glanceTarget.toFixed(4), 'duration:', (s.head.glanceDuration * 1000).toFixed(0) + 'ms');
/*  
    // Debug: Check what bones are available in humanoid system
    console.log('[animate] Available humanoid bones:', Object.keys(app.currentVRM.humanoid.humanBones || {}));
    console.log('[animate] Head bone from humanoid:', app.currentVRM.humanoid.getNormalizedBone('head'));
    console.log('[animate] Head bone from our finder:', b.head);
    */
  }
  
  // Calculate progress through glance cycle
  const elapsed = perfNow - s.head.glanceStartTime; // Clock-based elapsed
  
  if (s.head.glanceInProgress) {
    // Use VRM humanoid system for proper bone manipulation
    const headBoneWrapper = app.currentVRM.humanoid.getNormalizedBone('head'); // Use correct API
    if (!headBoneWrapper || !headBoneWrapper.node) {
      console.log('[animate] Head bone not found in humanoid system, falling back to direct bone');
      return; // Skip this frame if bone not found
    }
    
    const headBone = headBoneWrapper.node; // Get the actual bone from the wrapper
    
    // Debug: Log what we're doing
    if (Math.random() < 0.01) { // Only log 1% of the time to avoid spam
      console.log('[animate] Glance progress - elapsed:', elapsed.toFixed(3), 'target:', s.head.glanceTarget.toFixed(4), 'currentY:', headBone.rotation.y.toFixed(4));
    }
    
    if (elapsed < s.head.glanceDuration) {
      // Moving towards target
      const t = elapsed / s.head.glanceDuration;
      headBone.rotation.y = THREE.MathUtils.lerp(0, s.head.glanceTarget, t);
    } else if (elapsed < s.head.glanceDuration + s.head.holdDuration) {
      // Holding at target
      headBone.rotation.y = s.head.glanceTarget;
    } else if (elapsed < s.head.glanceDuration + s.head.holdDuration + s.head.returnDuration) {
      // Returning to center
      const returnElapsed = elapsed - s.head.glanceDuration - s.head.holdDuration;
      const t = returnElapsed / s.head.returnDuration;
      headBone.rotation.y = THREE.MathUtils.lerp(s.head.glanceTarget, 0, t);
    } else {
      // Glance complete
      headBone.rotation.y = 0;
      s.head.glanceInProgress = false;
      console.log('[animate] Glance complete - reset to center');
    }
  }
}

// Animation loop
export function animate(app) {
  if(!app.clock)
    app.clock = new THREE.Clock();
  requestAnimationFrame(() => animate(app));
  app.sceneRenderer.update();
  const dt = app.clock.getDelta();
  if (app.sceneRenderer.currentMixer) app.sceneRenderer.currentMixer.update(dt);
  // Process pending avatar updates (expressions/animations)
  if (app.pendingAvatarUpdates && app.pendingAvatarUpdates.length > 0) {
    const currentTimeMs = (app.pcmPlayer?.playCursor || 0) * 1000; // Convert seconds to ms
    app.pendingAvatarUpdates = app.pendingAvatarUpdates.filter(pending => {
      if (currentTimeMs >= pending.targetTime) {
        // Process the update
        if (pending.type === 'expression') {
          console.log("PROCESSING EXPRESSION:", pending.value, "at audio time:", currentTimeMs, "ms");
          if (app.currentVRM) {
            app.sceneRenderer.setExpression(app.currentVRM, pending.value);
          }
        } else if (pending.type === 'animation') {
          console.log("PROCESSING ANIMATION:", pending.value, "at audio time:", currentTimeMs, "ms");
          if (app.currentVRM) {
            app.sceneRenderer.loadFBX(pending.animationUrl, app);
          }
        }
        return false; // Remove from pending
      }
      return true; // Keep pending
    });
  }
  if (app.currentVRM) {
    animateLipSync(app);
    animateIdleStates(app);              // VRM API calls go here (before vrm.update)
    
    // Update keyframe dance animations
    if (app.danceFrameSystem) {
      app.danceFrameSystem.update(dt);
    }
    
    if (app.currentVRM.update)
      app.currentVRM.update(1/60, { renderer: app.sceneRenderer.renderer, scene: app.sceneRenderer.scene, camera: app.sceneRenderer.camera });
    // Apply post-vrm.update idle animations (direct bone edits only)
    animateIdleStatesPostUpdate(app);    // Only direct bone manipulation
  }
  app.sceneRenderer.renderer.render(app.sceneRenderer.scene, app.sceneRenderer.camera);
}
