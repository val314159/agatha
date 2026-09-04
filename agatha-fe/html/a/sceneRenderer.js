// Scene rendering management class
import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    DirectionalLight,
    AmbientLight,
    Box3,
    Vector3,
    AnimationMixer,
    LoopOnce,
    AnimationClip,
    Quaternion,
    QuaternionKeyframeTrack,
    VectorKeyframeTrack
} from 'three';
import { VRM } from '@pixiv/three-vrm';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { initializeAnimations } from './animate.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// Define expressionMap locally
const expressionMap = {
    happy:    ["happy", "smile", "joy"],
    angry:    ["angry", "mad"],
    sad:      ["sad", "sorrow"],
    relaxed:  ["relaxed", "calm"],
    surprised:["surprised", "surprise"],
    neutral:  ["neutral", "default"]
};

export class SceneRenderer {
    // Mixamo to VRM rig mapping
    static mixamoVRMRigMap = {
        mixamorigHips: 'hips',
        mixamorigSpine: 'spine',
        mixamorigSpine1: 'chest',
        mixamorigSpine2: 'upperChest',
        mixamorigNeck: 'neck',
        mixamorigHead: 'head',
        mixamorigLeftShoulder: 'leftShoulder',
        mixamorigLeftArm: 'leftUpperArm',
        mixamorigLeftForeArm: 'leftLowerArm',
        mixamorigLeftHand: 'leftHand',
        mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
        mixamorigLeftHandThumb2: 'leftThumbProximal',
        mixamorigLeftHandThumb3: 'leftThumbDistal',
        mixamorigLeftHandIndex1: 'leftIndexProximal',
        mixamorigLeftHandIndex2: 'leftIndexIntermediate',
        mixamorigLeftHandIndex3: 'leftIndexDistal',
        mixamorigLeftHandMiddle1: 'leftMiddleProximal',
        mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
        mixamorigLeftHandMiddle3: 'leftMiddleDistal',
        mixamorigLeftHandRing1: 'leftRingProximal',
        mixamorigLeftHandRing2: 'leftRingIntermediate',
        mixamorigLeftHandRing3: 'leftRingDistal',
        mixamorigLeftHandPinky1: 'leftLittleProximal',
        mixamorigLeftHandPinky2: 'leftLittleIntermediate',
        mixamorigLeftHandPinky3: 'leftLittleDistal',
        mixamorigRightShoulder: 'rightShoulder',
        mixamorigRightArm: 'rightUpperArm',
        mixamorigRightForeArm: 'rightLowerArm',
        mixamorigRightHand: 'rightHand',
        mixamorigRightHandPinky1: 'rightLittleProximal',
        mixamorigRightHandPinky2: 'rightLittleIntermediate',
        mixamorigRightHandPinky3: 'rightLittleDistal',
        mixamorigRightHandRing1: 'rightRingProximal',
        mixamorigRightHandRing2: 'rightRingIntermediate',
        mixamorigRightHandRing3: 'rightRingDistal',
        mixamorigRightHandMiddle1: 'rightMiddleProximal',
        mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
        mixamorigRightHandMiddle3: 'rightMiddleDistal',
        mixamorigRightHandIndex1: 'rightIndexProximal',
        mixamorigRightHandIndex2: 'rightIndexIntermediate',
        mixamorigRightHandIndex3: 'rightIndexDistal',
        mixamorigRightHandThumb1: 'rightThumbMetacarpal',
        mixamorigRightHandThumb2: 'rightThumbProximal',
        mixamorigRightHandThumb3: 'rightThumbDistal',
        mixamorigLeftUpLeg: 'leftUpperLeg',
        mixamorigLeftLeg: 'leftLowerLeg',
        mixamorigLeftFoot: 'leftFoot',
        mixamorigLeftToeBase: 'leftToes',
        mixamorigRightUpLeg: 'rightUpperLeg',
        mixamorigRightLeg: 'rightLowerLeg',
        mixamorigRightFoot: 'rightFoot',
        mixamorigRightToeBase: 'rightToes',
    };
    constructor(container) {
        this.container = container;
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        
        // Initialize core Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.timeScale = 0.6; // controls animation speed
        
        // Animation-related properties
        this.currentMixer = null;
        this.currentAnimationUrl = null;
        this.currentAction = null;
        
        // Idle animation state
        this.idleAnimationState = {
            breathing: { active: true, phase: Math.random() * Math.PI * 2, frequency: 0.25 + Math.random() * 0.1, amplitude: 0.005 },
            weightShift: { active: true, phase: Math.random() * Math.PI * 2, frequency: 0.05 + Math.random() * 0.03, amplitude: 0.01, nextChangeTime: performance.now() + 5000 + Math.random() * 5000 },
            arms:       { active: true, leftPhase: Math.random() * Math.PI * 2, rightPhase: Math.random() * Math.PI * 2, frequency: 0.1 + Math.random() * 0.05, amplitude: 0.008 },
            fingers:    { active: true, phase: Math.random() * Math.PI * 2, frequency: 0.15 + Math.random() * 0.1, amplitude: 0.01, nextWiggleTime: performance.now() + 3000 + Math.random() * 4000 },
            head:       { active: true, phase: Math.random() * Math.PI * 2, frequency: 0.07 + Math.random() * 0.04, amplitude: 0.01, nextLookTime: performance.now() + 4000 + Math.random() * 3000 }
        };
        
        // Setup the scene
        this.initScene();
        this.setupLighting();
        this.setupResizeHandler();

        // Initialize VRM Loader
        this.vrmLoader = new GLTFLoader();
        this.vrmLoader.register(parser => new VRMLoaderPlugin(parser));
    }
    
    // Initialize the scene, camera, renderer and controls
    initScene() {
        // Scene setup
        this.scene = new Scene();
        
        // Camera setup
        this.camera = new PerspectiveCamera(35, this.width / this.height, 0.1, 1000);
        this.camera.position.set(0, 1.4, 2.2);
        
        // Renderer setup
        this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Make sure the canvas is properly layered above the history
        this.renderer.domElement.style.position = 'relative';
        this.renderer.domElement.style.zIndex = '10';
        this.renderer.domElement.style.pointerEvents = 'auto';
        
        // Add renderer to container
        this.container.appendChild(this.renderer.domElement);
        
        // Controls setup
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1.4, 0); // Focus on avatar head height
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 10;
        this.controls.maxPolarAngle = Math.PI / 2;
    }
    
    // Setup scene lighting
    setupLighting() {
        const directionalLight = new DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(1, 3, 2);
        this.scene.add(directionalLight);
        this.scene.add(new AmbientLight(0xffffff, 0.5));
    }
    
    // Handle window resize events
    setupResizeHandler() {
        window.addEventListener('resize', () => {
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
    }
    
    // Add an object to the scene
//add(object) {//
//        this.scene.add(object);
//    }
    
    // Remove an object from the scene
    remove(object) {
        this.scene.remove(object);
    }
    
    // Update the scene (called in animation loop)
    update() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    // Frame camera to focus on an object
    frameCamera(object) {
        if (!object) return;
        const box = new Box3().setFromObject(object);
        const size = box.getSize(new Vector3()).length();
        const center = box.getCenter(new Vector3());
        this.camera.near = size / 100;
        this.camera.far = size * 100;
        this.camera.updateProjectionMatrix();
        this.camera.position.copy(center);
        this.camera.position.x += 0.0;
        this.camera.position.y += 1.4;
        this.camera.position.z += size * 1.2;
        this.camera.lookAt(center);
    }

    /**
     * Load a VRM model and set up all necessary state
     * @param {object} app - Application instance
     * @param {string} modelPath - path to the VRM/glTF model
     */
    loadVRMModel(app, modelPath) {
        // Remove old VRM from scene
        if (app.currentVRM && app.currentVRM.scene) {
            this.remove(app.currentVRM.scene);
        }
        // Unload any current animation
        this.unloadFBX();
        app.currentVRM = null;
        this.lastModelLoadProgress = null;
        const currentVRMUrl = modelPath;
        app.avatarBones = null;
        // Use the instance loader
        this.vrmLoader.load(modelPath, (gltf) => {
            const vrm = gltf.userData.vrm;
            app.currentVRM = vrm; // for lip sync
            this.scene.add(vrm.scene);
            // make a new mixer
            this.currentMixer = new AnimationMixer(vrm.scene);
            // Find mouth expression key for VRM 1.0+ or fallback for VRM 0.x
            let mouthExpressionKey = null;
            let mouthWidenKey = null;
            if (vrm.expressionManager || vrm.expressions) {
                const exprMgr = vrm.expressionManager || vrm.expressions;
                let keys = [];
                if (exprMgr._expressionMap && typeof exprMgr._expressionMap.keys === 'function') {
                    keys = Array.from(exprMgr._expressionMap.keys());
                } else if (exprMgr._expressionMap && typeof exprMgr._expressionMap === 'object') {
                    keys = Object.keys(exprMgr._expressionMap);
                } else if (exprMgr.expressions) {
                    keys = Object.keys(exprMgr.expressions);
                }
                console.log("Available VRM 1.0 expression keys:", keys);
                const mouthOpenCandidates = ["aa","ih","ou","ee","oh","mouthopen","mouth_a"];
                const mouthWidenCandidates = ["wide","mouthwide","mouth_wide","smile","mouthstretch"];
                mouthExpressionKey = keys.find(k => mouthOpenCandidates.some(m => k.toLowerCase().includes(m.toLowerCase())));
                mouthWidenKey = keys.find(k => mouthWidenCandidates.some(m => k.toLowerCase().includes(m.toLowerCase())));
                if (!mouthExpressionKey) console.warn("No mouth-open expression found.");
                if (!mouthWidenKey) console.warn("No mouth-widen expression found.");
            } else if (vrm.blendShapeProxy) {
                let keys = [];
                if (vrm.blendShapeProxy._blendShapeValues) {
                    keys = Object.keys(vrm.blendShapeProxy._blendShapeValues);
                }
                if (vrm.blendShapeProxy._blendShapeGroups) {
                    keys = keys.concat(Object.keys(vrm.blendShapeProxy._blendShapeGroups));
                }
                const mouthOpenCandidates = ["A","I","U","E","O","aa","ih","ou","ee","oh","mouthOpen","mouth_a"];
                const mouthWidenCandidates = ["wide","mouthwide","mouth_wide","smile","mouthstretch"];
                mouthExpressionKey = keys.find(k => mouthOpenCandidates.some(m => k.toLowerCase().includes(m.toLowerCase())));
                mouthWidenKey = keys.find(k => mouthWidenCandidates.some(m => k.toLowerCase().includes(m.toLowerCase())));
                if (!mouthExpressionKey) console.warn("No mouth-open blend shape found.");
                if (!mouthWidenKey) console.warn("No mouth-widen blend shape found.");
            } else {
               console.warn("No blendShapeProxy or VRM 1.0 expression system found on loaded VRM model.");
            }
            app.lipSync.mouthExpressionKey = mouthExpressionKey;
            app.lipSync.mouthWidenKey = mouthWidenKey;
            // Find (optional) jaw bone
            let jawBone = null;
            vrm.scene.traverse(obj => {
                if (obj.isBone && obj.name === 'J_Bip_C_Head') jawBone = obj;
            });
            app.lipSync.jawBone = jawBone;
            // Frame camera using SceneRenderer's frameCamera method
            this.frameCamera(vrm.scene);
            
            // Initialize animations after VRM is fully loaded
            initializeAnimations(app);
        },
        (progress) => {
            var prog = 100.0 * (progress.loaded / progress.total);
            const step = 20;
            prog /= step;
            prog = Math.floor(prog);
            prog *= step;
            if (this.lastModelLoadProgress !== prog) {
                this.lastModelLoadProgress = prog;
                console.log('Loading model...', prog, '%');
            }
        },
        (error) => console.error(error)
        );
    }
    
    /**
     * Unload the current FBX animation
     */
    unloadFBX() {
        if (this.currentMixer) {
            this.currentMixer.stopAllAction();
        }
        this.currentAnimationUrl = null;
        this.currentAction = null;
        
        // Re-enable idle animations
        if (this.idleAnimationState) {
            this.idleAnimationState.breathing.active = true;
            this.idleAnimationState.weightShift.active = true;
            this.idleAnimationState.arms.active = true;
            this.idleAnimationState.head.active = true;
        }
    }
    
    /**
     * Load an FBX animation for the current VRM model
     * @param {string} animationUrl - URL of the animation to load
     * @param {object} appInstance - Application instance with currentVRM and animationTimeScale
     */
    loadFBX(animationUrl, appInstance) {
        if (!appInstance.currentVRM) {
            console.error('No VRM model loaded');
            return;
        }
        
        // Store animation URL
        this.currentAnimationUrl = animationUrl;
        
        // Disable idle animations when playing a full-body animation
        this.idleAnimationState.breathing.active = false;
        this.idleAnimationState.weightShift.active = false;
        this.idleAnimationState.arms.active = false;
        this.idleAnimationState.head.active = false;
        
        // Load animation using loadMixamoAnimation method
        this.loadMixamoAnimation(animationUrl, appInstance.currentVRM).then((clip) => {

            const fade = 0.75; // or 0.4;
            console.log("Animation fade:", fade)

                // Apply the loaded animation to mixer and play
            const nextAction = this.currentMixer.clipAction(clip);
            nextAction.reset();
            if (this.currentAction) {
                nextAction.crossFadeFrom(this.currentAction, fade, true); // single mix
            }
            nextAction.loop = LoopOnce;
            nextAction.clampWhenFinished = true;
            nextAction.play();
            this.currentAction = nextAction;
            this.currentMixer.timeScale = this.timeScale;

            if (this.onAnimationFinished) {
                this.currentMixer.removeEventListener('finished', this.onAnimationFinished);
            }

            this.onAnimationFinished = () => {
                console.log('Animation finished:', animationUrl);
                if (this.currentAction) this.currentAction.stop();
                nextAction.reset();
                nextAction.play();
                this.currentAction = nextAction;
            };

            // Replay animation when finished
            this.currentMixer.addEventListener('finished', this.onAnimationFinished);

        }).catch(error => {
            console.error('Error loading animation:', error);
            this.unloadFBX(); // Clean up on error
        });
    }
    
    /**
     * Load Mixamo animation, convert for VRM use, and return it.
     *
     * @param {string} url A url of mixamo animation data
     * @param {VRM} vrm A target VRM
     * @returns {Promise<AnimationClip>} The converted AnimationClip
     */
    loadMixamoAnimation(url, vrm) {
        const loader = new FBXLoader(); // A loader which loads FBX
        return loader.loadAsync(url).then((asset) => {
            const clip = AnimationClip.findByName(asset.animations, 'mixamo.com'); // extract the AnimationClip
            console.log('Loaded clip: ' + clip);

            const tracks = []; // KeyframeTracks compatible with VRM will be added here

            const restRotationInverse = new Quaternion();
            const parentRestWorldRotation = new Quaternion();
            const _quatA = new Quaternion();
            const _vec3 = new Vector3();

            // Adjust with reference to hips height.
            const motionHipsHeight = asset.getObjectByName('mixamorigHips').position.y;
            const vrmHipsY = vrm.humanoid?.getNormalizedBoneNode('hips').getWorldPosition(_vec3).y;
            const vrmRootY = vrm.scene.getWorldPosition(_vec3).y;
            const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
            const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

            clip.tracks.forEach((track) => {
                // Convert each tracks for VRM use, and push to `tracks`
                const trackSplitted = track.name.split('.');
                const mixamoRigName = trackSplitted[0];
                const vrmBoneName = SceneRenderer.mixamoVRMRigMap[mixamoRigName];
                const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
                const mixamoRigNode = asset.getObjectByName(mixamoRigName);

                if (vrmNodeName != null) {
                    const propertyName = trackSplitted[1];

                    // Store rotations of rest-pose.
                    mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
                    mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

                    if (track instanceof QuaternionKeyframeTrack) {
                        // Retarget rotation of mixamoRig to NormalizedBone.
                        for (let i = 0; i < track.values.length; i += 4) {
                            const flatQuaternion = track.values.slice(i, i + 4);
                            _quatA.fromArray(flatQuaternion);
                            _quatA
                                .premultiply(parentRestWorldRotation)
                                .multiply(restRotationInverse);
                            _quatA.toArray(flatQuaternion);
                            flatQuaternion.forEach((v, index) => {
                                track.values[index + i] = v;
                            });
                        }

                        tracks.push(
                            new QuaternionKeyframeTrack(
                                `${vrmNodeName}.${propertyName}`,
                                track.times,
                                track.values.map((v, i) => (vrm.meta?.metaVersion === '0' && i % 2 === 0 ? -v : v)),
                            ),
                        );
                    } else if (track instanceof VectorKeyframeTrack) {
                        const value = track.values.map((v, i) => (vrm.meta?.metaVersion === '0' && i % 3 !== 1 ? -v : v) * hipsPositionScale);
                        tracks.push(new VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value));
                    }
                }
            });

            return new AnimationClip('vrmAnimation', clip.duration, tracks);
        });
    }

    // Set expression on the current VRM model
    setExpression(vrm, expr) {
        if (!vrm) return;
        let exprMgr = vrm.expressionManager || vrm.expressions;
        let blendShapeProxy = vrm.blendShapeProxy;
        let allKeys = [];
        // VRM 1.0
        if (exprMgr) {
            if (exprMgr._expressionMap && typeof exprMgr._expressionMap.keys === 'function') {
                allKeys = Array.from(exprMgr._expressionMap.keys());
            } else if (exprMgr._expressionMap && typeof exprMgr._expressionMap === 'object') {
                allKeys = Object.keys(exprMgr._expressionMap);
            } else if (exprMgr.expressions) {
                allKeys = Object.keys(exprMgr.expressions);
            }
            // Reset all
            if (typeof exprMgr.setValue === 'function') {
                allKeys.forEach(k => exprMgr.setValue(k, 0));
            } else if (exprMgr.expressions) {
                allKeys.forEach(k => exprMgr.expressions[k].weight = 0);
            }
            // Set selected
            const candidates = expressionMap[expr] || [];
            const found = allKeys.find(k => candidates.some(c => k.toLowerCase().includes(c)));
            if (found) {
                if (typeof exprMgr.setValue === 'function') {
                    exprMgr.setValue(found, 1);
                } else if (exprMgr.expressions && exprMgr.expressions[found]) {
                    exprMgr.expressions[found].weight = 1;
                }
            }
        }
        // VRM 0.x
        if (blendShapeProxy) {
            if (blendShapeProxy._blendShapeValues) {
                allKeys = Object.keys(blendShapeProxy._blendShapeValues);
            }
            if (blendShapeProxy._blendShapeGroups) {
                allKeys = allKeys.concat(Object.keys(blendShapeProxy._blendShapeGroups));
            }
            allKeys.forEach(k => blendShapeProxy.setValue(k, 0));
            const candidates = expressionMap[expr] || [];
            const found = allKeys.find(k => candidates.some(c => k.toLowerCase().includes(c)));
            if (found) blendShapeProxy.setValue(found, 1);
        }
    }

    // Setup scene lighting
    setupLighting() {
        const directionalLight = new DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(1, 3, 2);
        this.scene.add(directionalLight);
        this.scene.add(new AmbientLight(0xffffff, 0.5));
    }
}
