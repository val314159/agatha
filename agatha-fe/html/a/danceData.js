/**
 * Dance Animation Data
 * All keyframe animations separated from system code
 */

export const SampleAnimations = {
  /**
   * K-pop Point dance - ultra smooth version
   */
  kpopPointKeyframe: {
    name: 'kpopPointKeyframe',
    duration: 2.0,
    easing: 'easeInOut',
    keyframes: [
      {
        time: 0.0,
        bones: {
          'hips': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
        }
      },
      {
        time: 0.125,
        bones: {
          'hips': { position: [0, 0.01, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0.02, 0, 0.999] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0.05, 0, 0.998] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, -0.2, 0, 0.979] }
        }
      },
      {
        time: 0.25,
        bones: {
          'hips': { position: [0, 0.02, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0.04, 0, 0.999] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0.1, 0, 0.995] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, -0.35, 0, 0.936] }
        }
      },
      {
        time: 0.375,
        bones: {
          'hips': { position: [0, 0.025, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0.06, 0, 0.998] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0.15, 0, 0.988] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, -0.5, 0, 0.866] }
        }
      },
      {
        time: 0.5,
        bones: {
          'hips': { position: [0, 0.03, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0.08, 0, 0.996] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0.2, 0, 0.98] },
          'rightUpperArm': { 
            position: [0, 0, 0], 
            quaternion: [0, -0.6, 0, 0.8],
            easing: 'easeOut'
          }
        }
      },
      {
        time: 0.625,
        bones: {
          'hips': { position: [0, 0.025, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0.06, 0, 0.998] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0.15, 0, 0.988] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, -0.5, 0, 0.866] }
        }
      },
      {
        time: 0.75,
        bones: {
          'hips': { position: [0, 0.02, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0.04, 0, 0.999] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0.1, 0, 0.995] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, -0.35, 0, 0.936] }
        }
      },
      {
        time: 0.875,
        bones: {
          'hips': { position: [0, 0.01, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0.02, 0, 0.999] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0.05, 0, 0.998] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, -0.2, 0, 0.979] }
        }
      },
      {
        time: 1.0,
        bones: {
          'hips': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
        }
      },
      {
        time: 1.125,
        bones: {
          'hips': { position: [0, 0.01, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, -0.02, 0, 0.999] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, -0.2, 0, 0.979] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0.05, 0, 0.998] }
        }
      },
      {
        time: 1.25,
        bones: {
          'hips': { position: [0, 0.02, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, -0.04, 0, 0.999] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, -0.35, 0, 0.936] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0.1, 0, 0.995] }
        }
      },
      {
        time: 1.375,
        bones: {
          'hips': { position: [0, 0.025, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, -0.06, 0, 0.998] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, -0.5, 0, 0.866] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0.15, 0, 0.988] }
        }
      },
      {
        time: 1.5,
        bones: {
          'hips': { position: [0, 0.03, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, -0.08, 0, 0.996] },
          'leftUpperArm': { 
            position: [0, 0, 0], 
            quaternion: [0, -0.6, 0, 0.8],
            easing: 'easeOut'
          },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0.2, 0, 0.98] }
        }
      },
      {
        time: 1.625,
        bones: {
          'hips': { position: [0, 0.025, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, -0.06, 0, 0.998] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, -0.5, 0, 0.866] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0.15, 0, 0.988] }
        }
      },
      {
        time: 1.75,
        bones: {
          'hips': { position: [0, 0.02, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, -0.04, 0, 0.999] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, -0.35, 0, 0.936] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0.1, 0, 0.995] }
        }
      },
      {
        time: 1.875,
        bones: {
          'hips': { position: [0, 0.01, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, -0.02, 0, 0.999] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, -0.2, 0, 0.979] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0.05, 0, 0.998] }
        }
      },
      {
        time: 2.0,
        bones: {
          'hips': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'leftUpperArm': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
        }
      }
    ]
  },

  /**
   * Basic Groove dance - with bounce easing
   */
  basicGrooveKeyframe: {
    name: 'basicGrooveKeyframe',
    duration: 1.0,
    easing: 'easeOut',
    keyframes: [
      {
        time: 0.0,
        bones: {
          'hips': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
        }
      },
      {
        time: 0.25,
        bones: {
          'hips': { position: [0, 0.03, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0, 0.05, 0.998] }
        }
      },
      {
        time: 0.5,
        bones: {
          'hips': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
        }
      },
      {
        time: 0.75,
        bones: {
          'hips': { position: [0, -0.03, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0, -0.05, 0.998] }
        }
      },
      {
        time: 1.0,
        bones: {
          'hips': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          'head': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
        }
      }
    ]
  },

  /**
   * Hip Hop - compact keyframe version
   */
  hipHopKeyframe: {
    name: 'hipHopKeyframe',
    duration: 2.0,
    keyframes: [
      {
        time: 0.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      },
      {
        time: 0.5,
        bones: {
          'hips': {
            position: [0, 0.08, 0],
            quaternion: [0, 0.1, 0, 0.995]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0.2, 0.98]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0.5, 0.866]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, -0.5, 0.866]
          }
        }
      },
      {
        time: 1.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, -0.1, 0, 0.995]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, -0.2, 0.98]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, -0.5, 0.866]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0.5, 0.866]
          }
        }
      },
      {
        time: 1.5,
        bones: {
          'hips': {
            position: [0, 0.08, 0],
            quaternion: [0, 0.1, 0, 0.995]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0.2, 0.98]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0.5, 0.866]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, -0.5, 0.866]
          }
        }
      },
      {
        time: 2.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      }
    ]
  },

  /**
   * Salsa dance - Latin hip movement
   */
  salsaKeyframe: {
    name: 'salsaKeyframe',
    duration: 2.0,
    keyframes: [
      {
        time: 0.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0.196, 0.968]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, -0.196, 0.968]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      },
      {
        time: 0.5,
        bones: {
          'hips': {
            position: [0.04, 0.03, 0],
            quaternion: [0, 0, 0.059, 0.998]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0.196, 0.968]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, -0.196, 0.968]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0.025, 0, 0.999]
          }
        }
      },
      {
        time: 1.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, -0.059, 0.998]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0.196, 0.968]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, -0.196, 0.968]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, -0.025, 0, 0.999]
          }
        }
      },
      {
        time: 1.5,
        bones: {
          'hips': {
            position: [-0.04, 0.03, 0],
            quaternion: [0, 0, 0.059, 0.998]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0.196, 0.968]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, -0.196, 0.968]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0.025, 0, 0.999]
          }
        }
      },
      {
        time: 2.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0.196, 0.968]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, -0.196, 0.968]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      }
    ]
  },

  /**
   * K-pop Shoulder dance - sharp shoulder movements
   */
  kpopShoulderKeyframe: {
    name: 'kpopShoulderKeyframe',
    duration: 2.0,
    keyframes: [
      {
        time: 0.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      },
      {
        time: 0.5,
        bones: {
          'hips': {
            position: [0, 0.02, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.195, 0, 0.148, 0.968]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.05, 0, -0.05, 0.997]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0.025, 0.999]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0.04, 0, 0.999]
          }
        }
      },
      {
        time: 1.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      },
      {
        time: 1.5,
        bones: {
          'hips': {
            position: [0, 0.02, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.05, 0, 0.05, 0.997]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.195, 0, -0.148, 0.968]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0.025, 0.999]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, -0.04, 0, 0.999]
          }
        }
      },
      {
        time: 2.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      }
    ]
  },

  /**
   * K-pop Arm Wave - smooth flowing arm movements
   */
  kpopArmWaveKeyframe: {
    name: 'kpopArmWaveKeyframe',
    duration: 3.0,
    keyframes: [
      {
        time: 0.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0, 0.989]
          },
          'leftLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0, 0.989]
          },
          'rightLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      },
      {
        time: 0.75,
        bones: {
          'hips': {
            position: [0, 0.02, 0],
            quaternion: [0, 0.015, 0, 0.999]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.247, 0, 0.148, 0.958]
          },
          'leftLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.195, 0, 0.074, 0.978]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, -0.148, 0.983]
          },
          'rightLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.05, 0, -0.074, 0.996]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0.025, 0, 0.999]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0.012, 0, 0.999]
          }
        }
      },
      {
        time: 1.5,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0.196, 0.975]
          },
          'leftLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0.148, 0.976]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.247, 0, -0.196, 0.946]
          },
          'rightLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.195, 0, -0.148, 0.968]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0.05, 0.012, 0.999]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0.019, 0, 0.999]
          }
        }
      },
      {
        time: 2.25,
        bones: {
          'hips': {
            position: [0, -0.02, 0],
            quaternion: [0, -0.015, 0, 0.999]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, -0.148, 0.983]
          },
          'leftLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.05, 0, -0.074, 0.996]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.247, 0, 0.148, 0.958]
          },
          'rightLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.195, 0, 0.074, 0.978]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, -0.025, 0, 0.999]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, -0.012, 0, 0.999]
          }
        }
      },
      {
        time: 3.0,
        bones: {
          'hips': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'leftUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0, 0.989]
          },
          'leftLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'rightUpperArm': {
            position: [0, 0, 0],
            quaternion: [-0.148, 0, 0, 0.989]
          },
          'rightLowerArm': {
            position: [0, 0, 0],
            quaternion: [-0.099, 0, 0, 0.995]
          },
          'head': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          },
          'spine': {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
          }
        }
      }
    ]
  }
};
