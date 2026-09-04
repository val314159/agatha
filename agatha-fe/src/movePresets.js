const TAU = Math.PI * 2;

export const MOVE_PRESETS = [
  {
    id: 'side-step',
    name: 'Side Step',
    tempo: 0.75,
    sample: sampleSideStep,
  },
  {
    id: 'arm-wave',
    name: 'Arm Wave',
    tempo: 0.9,
    sample: sampleArmWave,
  },
  {
    id: 'box-step',
    name: 'Box Step',
    tempo: 0.72,
    sample: sampleBoxStep,
  },
  {
    id: 'hands-hips',
    name: 'Hands Hips',
    tempo: 0.65,
    sample: sampleHandsHips,
  },
  {
    id: 'knee-bounce',
    name: 'Knee Bounce',
    tempo: 1.2,
    sample: sampleKneeBounce,
  },
  {
    id: 'cross-punch',
    name: 'Cross Punch',
    tempo: 0.95,
    sample: sampleCrossPunch,
  },
  {
    id: 'plant-shift',
    name: 'Plant Shift',
    tempo: 0.7,
    sample: samplePlantShift,
  },
  {
    id: 'disco-point',
    name: 'Disco Point',
    tempo: 0.78,
    sample: sampleDiscoPoint,
  },
];

export function getMovePreset(id) {
  return MOVE_PRESETS.find((move) => move.id === id) || MOVE_PRESETS[0];
}

function sampleSideStep(time, tempo) {
  const phase = phaseOf(time, tempo);
  const wave = Math.sin(phase * TAU);
  const step = smoothPulse(phase);
  const leftPlant = phase < 0.5;

  return {
    phase,
    hips: { x: 0.07 * wave, y: 0.025 * Math.abs(wave), z: 0, rz: -5 * wave },
    chest: { ry: 7 * wave, rz: -3 * wave },
    hands: {
      left: point('leftHandRest', -0.06 * step, 0.02, 0.04),
      right: point('rightHandRest', 0.06 * (1 - step), 0.02, 0.04),
    },
    handPoles: defaultHandPoles(),
    feet: {
      left: foot('leftFootRest', -0.06 * step, 0, 0, leftPlant),
      right: foot('rightFootRest', 0.06 * (1 - step), 0, 0, !leftPlant),
    },
    footPoles: defaultFootPoles(),
  };
}

function sampleArmWave(time, tempo) {
  const phase = phaseOf(time, tempo);
  const wave = Math.sin(phase * TAU);
  const small = Math.sin(phase * TAU * 2);

  return {
    phase,
    hips: { x: 0.025 * wave, y: 0.015 * Math.abs(small), z: 0, rz: -3 * wave },
    chest: { ry: 5 * wave, rz: 3 * wave },
    head: { ry: -4 * wave },
    hands: {
      left: point('chest', -0.28, -0.12, 0.08),
      right: point('head', 0.22 + 0.06 * small, 0.24 + 0.04 * wave, 0.05),
    },
    handPoles: {
      left: point('chest', -0.44, -0.08, 0.02),
      right: point('head', 0.5, 0.08, 0.02),
    },
    feet: plantedFeet(),
    footPoles: defaultFootPoles(),
  };
}

function sampleBoxStep(time, tempo) {
  const phase = phaseOf(time, tempo);
  const quadrant = Math.floor(phase * 4);
  const local = phase * 4 - quadrant;
  const lift = Math.sin(local * Math.PI) * 0.055;
  const sway = Math.sin(phase * TAU);
  const leftFree = quadrant === 0 || quadrant === 3;

  return {
    phase,
    hips: { x: 0.045 * sway, y: 0.015 * Math.abs(sway), z: 0.02 * Math.cos(phase * TAU), ry: 4 * sway },
    chest: { ry: -5 * sway },
    hands: {
      left: point('leftHandRest', -0.03, 0.08 + 0.03 * sway, 0.05),
      right: point('rightHandRest', 0.03, 0.08 - 0.03 * sway, 0.05),
    },
    handPoles: defaultHandPoles(),
    feet: {
      left: foot('leftFootRest', leftFree ? -0.04 * stepCurve(local) : -0.02, leftFree ? lift : 0, quadrant === 0 ? 0.08 * stepCurve(local) : -0.05 * stepCurve(local), !leftFree),
      right: foot('rightFootRest', !leftFree ? 0.04 * stepCurve(local) : 0.02, !leftFree ? lift : 0, quadrant === 1 ? 0.08 * stepCurve(local) : -0.05 * stepCurve(local), leftFree),
    },
    footPoles: defaultFootPoles(),
  };
}

function sampleHandsHips(time, tempo) {
  const phase = phaseOf(time, tempo);
  const wave = Math.sin(phase * TAU);
  const reach = smoothPulse(phase);

  return {
    phase,
    hips: { x: 0.035 * wave, y: 0.012 * Math.abs(wave), z: 0, rz: 4 * wave },
    chest: { ry: -4 * wave, rz: -2 * wave },
    hands: {
      left: blendPoint(point('leftHandRest', -0.02, 0.04, 0.03), point('hips', -0.18, 0.11, 0.06), reach),
      right: blendPoint(point('rightHandRest', 0.02, 0.04, 0.03), point('hips', 0.18, 0.11, 0.06), reach),
    },
    handPoles: {
      left: point('chest', -0.48, -0.16, 0.04),
      right: point('chest', 0.48, -0.16, 0.04),
    },
    feet: plantedFeet(),
    footPoles: defaultFootPoles(),
  };
}

function sampleKneeBounce(time, tempo) {
  const phase = phaseOf(time, tempo);
  const bounce = Math.sin(phase * TAU * 2);
  const sway = Math.sin(phase * TAU);

  return {
    phase,
    hips: { x: 0.025 * sway, y: -0.055 * Math.max(0, bounce), z: 0, ry: 3 * sway },
    chest: { rx: -4 * Math.max(0, bounce), ry: -3 * sway },
    head: { rx: 2 * Math.max(0, bounce) },
    hands: {
      left: point('leftHandRest', -0.02, -0.03, 0.06),
      right: point('rightHandRest', 0.02, -0.03, 0.06),
    },
    handPoles: defaultHandPoles(),
    feet: plantedFeet(),
    footPoles: defaultFootPoles(),
  };
}

function sampleCrossPunch(time, tempo) {
  const phase = phaseOf(time, tempo);
  const leftPunch = Math.sin(phase * TAU) > 0;
  const punch = Math.abs(Math.sin(phase * TAU));
  const recoil = 1 - punch;

  return {
    phase,
    hips: { x: 0.03 * (leftPunch ? -1 : 1) * punch, y: 0.01 * punch, z: 0, ry: leftPunch ? 6 * punch : -6 * punch },
    chest: { ry: leftPunch ? 13 * punch : -13 * punch },
    hands: {
      left: leftPunch ? point('chest', 0.18, 0.02, 0.34) : point('leftHandRest', -0.05 * recoil, 0.05, 0.04),
      right: leftPunch ? point('rightHandRest', 0.05 * recoil, 0.05, 0.04) : point('chest', -0.18, 0.02, 0.34),
    },
    handPoles: {
      left: point('chest', -0.35, -0.07, 0.1),
      right: point('chest', 0.35, -0.07, 0.1),
    },
    feet: plantedFeet(),
    footPoles: defaultFootPoles(),
  };
}

function samplePlantShift(time, tempo) {
  const phase = phaseOf(time, tempo);
  const wave = Math.sin(phase * TAU);
  const lean = Math.sin(phase * TAU + Math.PI / 4);

  return {
    phase,
    hips: { x: 0.13 * wave, y: 0.018 * Math.abs(wave), z: 0.025 * lean, rz: -7 * wave },
    chest: { ry: 5 * lean, rz: 5 * wave },
    hands: {
      left: point('chest', -0.22, -0.08, 0.06),
      right: point('chest', 0.22, -0.08, 0.06),
    },
    handPoles: defaultHandPoles(),
    feet: plantedFeet(),
    footPoles: defaultFootPoles(),
  };
}

function sampleDiscoPoint(time, tempo) {
  const phase = phaseOf(time, tempo);
  const wave = Math.sin(phase * TAU);
  const pulse = smoothPulse(phase);

  return {
    phase,
    hips: { x: 0.04 * wave, y: 0.015 * Math.abs(wave), z: 0, ry: -8 * wave, rz: -4 * wave },
    chest: { ry: -10 * wave, rz: 4 * wave },
    head: { ry: 6 * wave, rx: -2 },
    hands: {
      left: point('hips', -0.18, 0.1, 0.05),
      right: point('head', 0.24 + 0.03 * pulse, 0.32 + 0.04 * pulse, 0.18),
    },
    handPoles: {
      left: point('chest', -0.45, -0.15, 0.04),
      right: point('head', 0.42, 0.16, 0.08),
    },
    feet: {
      left: foot('leftFootRest', -0.02, 0, 0, true),
      right: foot('rightFootRest', 0.03 * pulse, 0.02 * pulse, 0.02 * pulse, true),
    },
    footPoles: defaultFootPoles(),
  };
}

function plantedFeet() {
  return {
    left: foot('leftFootRest', 0, 0, 0, true),
    right: foot('rightFootRest', 0, 0, 0, true),
  };
}

function defaultHandPoles() {
  return {
    left: point('chest', -0.46, -0.08, 0.04),
    right: point('chest', 0.46, -0.08, 0.04),
  };
}

function defaultFootPoles() {
  return {
    left: point('hips', -0.14, -0.28, 0.26),
    right: point('hips', 0.14, -0.28, 0.26),
  };
}

function point(space, x, y, z) {
  return { space, x, y, z };
}

function foot(space, x, y, z, planted) {
  return { space, x, y, z, planted };
}

function blendPoint(a, b, amount) {
  return {
    space: 'blend',
    amount,
    a,
    b,
  };
}

function phaseOf(time, tempo) {
  return ((time * tempo) % 1 + 1) % 1;
}

function stepCurve(value) {
  return value * value * (3 - 2 * value);
}

function smoothPulse(phase) {
  return 0.5 - 0.5 * Math.cos(phase * TAU);
}
