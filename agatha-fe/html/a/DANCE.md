# Dance Animation System

A keyframe-based dance animation system for VRM models using local space transforms.

## Overview

The dance system provides two complementary approaches:
- **Procedural animations** (`danceSystem.js`) - Direct bone manipulation
- **Keyframe animations** (`danceFormat.js`) - Data-driven frame-based animations

## Keyframe Animation Format

The keyframe system uses a local space format that applies transforms relative to each bone's bind pose.

### Basic Structure

```javascript
{
  name: 'animationName',
  duration: 2.0,           // Animation length in seconds
  easing: 'easeInOut',      // Optional global easing
  keyframes: [
    {
      time: 0.0,            // Time marker for this keyframe
      bones: {
        'boneName': {
          position: [x, y, z],           // Local position offset
          quaternion: [x, y, z, w]      // Local rotation quaternion
        }
      }
    }
  ]
}
```

### Bone Naming

Uses VRM normalized bone names for maximum compatibility:
- `'hips'` - Hip/center body
- `'head'` - Head rotation
- `'leftUpperArm'`, `'rightUpperArm'` - Arms
- `'leftLowerArm'`, `'rightLowerArm'` - Forearms
- `'leftUpperLeg'`, `'rightUpperLeg'` - Thighs
- `'leftLowerLeg'`, `'rightLowerLeg'` - Calves

### Local Space Format

```javascript
'boneName': {
  position: [posX, posY, posZ],      // Local position offset from bind pose
  quaternion: [quatX, quatY, quatZ, quatW]  // Local rotation from bind pose
}
```

- **Position**: 3D offset from bone's bind pose position
- **Quaternion**: 4-component rotation relative to bind pose
- **Identity**: `[0, 0, 0]` for position, `[0, 0, 0, 1]` for quaternion

### Coordinate System

- **Y positive**: Upward movement (intuitive)
- **Local space**: All transforms relative to bone's original position
- **Hierarchical**: Parent bone movements affect child bones automatically

## Available Animations

The system includes 6 pre-built keyframe dances:

| Animation | Duration | Style | Description |
|-----------|----------|-------|-------------|
| `kpopPointKeyframe` | 2.0s | K-pop | Sharp arm points with hip bounce |
| `basicGrooveKeyframe` | 1.0s | Basic | Simple hip and head movement |
| `hipHopKeyframe` | 2.0s | Hip Hop | Dynamic arm movements with hip action |
| `salsaKeyframe` | 2.0s | Latin | Circular hip movement with arm poses |
| `kpopShoulderKeyframe` | 2.0s | K-pop | Sharp shoulder isolations |
| `kpopArmWaveKeyframe` | 3.0s | K-pop | Smooth flowing arm waves |

### Animation Data Location

Animation data is separated from system code:
- **System**: `danceFormat.js` - Core animation engine
- **Data**: `danceData.js` - All keyframe animations
- **Converter**: `fbxConverter.js` - FBX to keyframe conversion tool

## Usage Examples

### Complex Dance Move

```javascript
kpopPointKeyframe: {
  name: 'kpopPointKeyframe',
  duration: 2.0,
  keyframes: [
    {
      time: 0.0,
      bones: {
        'hips': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
        'head': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
        'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
      }
    },
    {
      time: 0.5,
      bones: {
        'hips': { position: [0, 0.05, 0], quaternion: [0, 0, 0, 1] },
        'head': { position: [0, 0, 0], quaternion: [0, 0.1, 0, 0.995] },
        'rightUpperArm': { position: [0, 0, 0], quaternion: [0, -0.8, 0, 0.6] }
      }
    },
    {
      time: 1.0,
      bones: {
        'hips': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
        'head': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
        'rightUpperArm': { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
      }
    }
  ]
}
```

## API Usage

### Initialize System

```javascript
import { DanceFrameSystem } from './danceFormat.js';
import { SampleAnimations } from './danceData.js';

// Create system with VRM model
const danceSystem = new DanceFrameSystem(vrm);

// Load animation
danceSystem.loadAnimation(SampleAnimations.kpopPointKeyframe);

// Start playback
danceSystem.start();

// Update in animation loop
function animate(deltaTime) {
  danceSystem.update(deltaTime);
}
```

### Load and Play Animation

```javascript
// Load animation
danceSystem.loadAnimation(SampleAnimations.kpopPointKeyframe);

// Start playback
danceSystem.start();

// Update in animation loop
function animate(deltaTime) {
  danceSystem.update(deltaTime);
}
```

### Control Playback

```javascript
// Stop animation
danceSystem.stop();

// Check status
const info = danceSystem.getInfo();
console.log(info.isActive, info.currentAnimation);
```

## Easing Functions

Control animation timing with easing:

### Global Easing
```javascript
{
  name: 'smoothDance',
  duration: 2.0,
  easing: 'easeInOut',  // Applied to all bones
  keyframes: [...]
}
```

### Per-Bone Easing
```javascript
{
  time: 0.5,
  bones: {
    'hips': {
      position: [0, 0.1, 0],
      quaternion: [0, 0, 0, 1],
      easing: 'bounce'  // Specific to this bone
    }
  }
}
```

### Available Easing Types
- `linear` - Constant speed
- `easeInQuad` - Slow start, fast end
- `easeOutQuad` - Fast start, slow end  
- `easeInOutQuad` - Slow start and end
- `easeInCubic` - Gentle slow start
- `easeOutCubic` - Gentle slow end
- `easeInOutCubic` - Gentle slow start and end
- `bounce` - Playful bouncing effect

## FBX Converter

The system includes a tool to convert FBX animations to keyframe format:

### Basic Usage
```javascript
import { FBXConverter } from './fbxConverter.js';

const converter = new FBXConverter();

// Convert FBX file
const animations = await converter.convertFBXFile('/models/dance.fbx', 15);

// Save converted animation
converter.saveAnimation(animations[0], 'dance_keyframe.json');
```

### Features
- **Bone mapping**: Mixamino to VRM bone names
- **Time sampling**: Configurable sample rate (default: 10fps)
- **Format conversion**: FBX curves to keyframe data
- **Export**: Directly usable keyframe animations

### Limitations
- **Curve simplification**: FBX Bézier curves become linear interpolation
- **Bone mapping**: Requires manual mapping for custom skeletons
- **Scale loss**: Scale transforms not supported in current format

## Performance Considerations

### Bone Caching
The system automatically caches VRM bone objects for performance:
```javascript
// Bones are cached on load
console.log(danceSystem.getInfo().cachedBones); // Number of cached bones
```

### Interpolation
- **Position**: Linear interpolation between keyframes
- **Quaternion**: Spherical linear interpolation (SLERP)
- **Frame Rate**: Independent of display rate - uses deltaTime

### Memory
- Local space storage with original pose caching
- Efficient bone object reuse
- Minimal garbage collection during playback

## Comparison with FBX

### Advantages over FBX
- **No bone name mapping** - Uses VRM normalized names directly
- **Smaller file size** - Explicit format vs verbose FBX
- **Better performance** - Preprocessed bone caching
- **Easy editing** - Human-readable JSON format
- **Local space consistency** - Same behavior as professional animations

### Limitations
- **Manual keyframing** - No animation editor (yet)
- **No blend shapes** - Facial expressions need separate system
- **Physics** - Relies on VRM's built-in physics for hair/cloth

## Integration

### With Existing Systems
```javascript
// Disable idle animations during dance
danceSystem.disableIdleAnimations();

// Restore after dance
danceSystem.restoreIdleAnimations();
```

### Animation Blending
```javascript
// Can be extended for blending multiple animations
// Future enhancement: weight-based blending between dances
```

## Creating New Animations

### Workflow
1. **Plan keyframes** - Identify major poses and timing
2. **Set positions** - Define bone positions for each keyframe
3. **Add rotations** - Set quaternion orientations
4. **Test interpolation** - Verify smooth transitions
5. **Refine timing** - Adjust keyframe timing and easing

### Tips
- **Start simple** - Basic hip movements first
- **Use reference** - Watch real dancers for natural movement
- **Test often** - Preview animations frequently
- **Layer complexity** - Add secondary motion after primary motion works

### Common Patterns
- **Hip circles** - 8-12 keyframes for smooth circles
- **Arm waves** - Progressive rotation through multiple keyframes
- **Body rolls** - Spine rotation with hip movement
- **Weight shifts** - Alternating left/right hip positions

## Integration

### With Existing Systems
```javascript
// Disable idle animations during dance
danceSystem.disableIdleAnimations();

// Restore after dance
danceSystem.restoreIdleAnimations();
```

### Animation Blending
```javascript
// Can be extended for blending multiple animations
// Future enhancement: weight-based blending between dances
```

## Troubleshooting

### Common Issues
- **Bones not moving** - Check bone names match VRM normalized names
- **Jerky motion** - Add more keyframes (easing functions planned for smoother transitions)
- **Wrong rotation** - Verify quaternion values (w should be close to 1 for identity)
- **Performance** - Reduce keyframe count or bone count

### Debug Tools
```javascript
// Get system info
console.log(danceSystem.getInfo());

// Check bone cache
console.log(Object.keys(danceSystem.currentAnimation?.boneCache || {}));
```

## Future Curve Support

### Planned Bezier Curve Extension

The current system uses linear interpolation between keyframes. Future versions will support curved paths using control points while maintaining the JSON format:

```javascript
// Future format with curve support
figure8Keyframe: {
  name: 'figure8Keyframe',
  duration: 2.0,
  keyframes: [
    {
      time: 0.0,
      bones: {
        'hips': {
          position: [0, 0, 0],
          controlPoint: [0.2, 0.3, 0]  // Bezier control point
        }
      }
    },
    {
      time: 0.5,
      bones: {
        'hips': {
          position: [0.15, 0, 0],
          controlPoint: [0.35, -0.2, 0]  // Next curve control
        }
      }
    }
  ]
}
```

### Benefits
- **Backward compatible** - Animations without control points use linear interpolation
- **JSON format** - No file format changes, just additional properties
- **Powerful curves** - Smooth figure-8s, circles, and complex dance paths
- **Human readable** - Easy to understand control point positions

### Current Workaround
Use more keyframes to approximate curves:
```javascript
// 8 keyframes create smoother figure-8 than 2
{ time: 0.0, bones: { hips: { position: [0, 0, 0] } } },
{ time: 0.125, bones: { hips: { position: [0.1, 0.05, 0] } } },
{ time: 0.25, bones: { hips: { position: [0.15, 0, 0] } } },
// ... more intermediate points
```

## Current Implementation Status

### ✅ Implemented Features
- **Keyframe animation system** - Core playback functionality
- **Local space transforms** - Character stays in place during dances
- **Explicit position/quaternion format** - Clear, readable data structure
- **Linear interpolation** - Smooth transitions between keyframes
- **VRM normalized bone support** - Direct bone name compatibility
- **Bone caching** - Performance optimization
- **Idle animation control** - Disable/restore during playback
- **Test UI integration** - Buttons for testing keyframe dances
- **Sample animations** - 6 complete dances with local space transforms
- **Reset pose functionality** - Return to bind pose
- **Easing functions** - 8 easing types for smooth transitions
- **Separated architecture** - System code in danceFormat.js, data in danceData.js
- **FBX converter tool** - Convert FBX animations to keyframe format

### 🔄 Planned Features (Next Priority)
- **Bezier curve support** - Curved paths using control points in JSON format
- **Animation blending** - Smooth transitions between dances
- **Inverse kinematics** - Automatic foot placement
- **Visual editor** - GUI for creating keyframe animations
- **Facial expressions** - Blend shape integration

### 📋 Extensions
- **Scaling support** - Add scale to bone data
- **Custom easing** - User-defined easing curves
- **Physics integration** - Enhanced physics response
- **Multi-character** - Synchronized group dances

## File Structure

```
danceFormat.js     - Animation system + easing functions
danceData.js       - All keyframe animations (6 dances)
fbxConverter.js   - FBX to keyframe conversion tool
ui.js            - UI integration (imports from danceData.js)
index.html       - Test interface with dance buttons
DANCE.md         - This documentation
```

## Contributing

### Adding Animations
1. Create new keyframe animation in `danceData.js` under `SampleAnimations`
2. Test with different VRM models
3. Update documentation
4. Submit pull request

### Adding Easing Functions
1. Add mathematical function to `danceFormat.js` in the easing section
2. Update `applyEasing` method with new case
3. Update documentation with new easing type
4. Add test animation demonstrating new easing

### Code Style
- Use explicit position/quaternion format
- Include easing for natural movement
- Add comments for complex choreography
- Test performance with multiple animations

## License

This dance animation system is part of the AI Lab project. See main project license for details.
