import './styles.css';
import { AvatarViewport } from './AvatarViewport.js';

const presets = new Map([
  ['/models/avaAvatar.vrm', { name: 'Ava Avatar' }],
  ['/models/VRM1_Constraint_Twist_Sample.vrm', { name: 'VRM Twist Sample' }],
  ['/models/cube.gltf', { name: 'Block Man' }],
]);

const fbxAnimations = [
  { path: '/models/Arm Stretching.fbx', name: 'Arm Stretching' },
  { path: '/models/Dying.fbx', name: 'Dying' },
  { path: '/models/Rumba Dancing.fbx', name: 'Rumba Dancing' },
  { path: '/models/Salute.fbx', name: 'Salute' },
  { path: '/models/Silly Dancing.fbx', name: 'Silly Dancing' },
  { path: '/models/Texting While Standing.fbx', name: 'Texting While Standing' },
];

const els = {
  viewport: document.querySelector('#viewport'),
  state: document.querySelector('#model-state'),
  progress: document.querySelector('#load-progress'),
  tabButtons: [...document.querySelectorAll('.tab-button')],
  tabPanels: [...document.querySelectorAll('.tab-panel')],
  select: document.querySelector('#avatar-select'),
  urlInput: document.querySelector('#avatar-url'),
  loadUrl: document.querySelector('#load-url'),
  fileInput: document.querySelector('#avatar-file'),
  resetCamera: document.querySelector('#reset-camera'),
  autoRotate: document.querySelector('#auto-rotate'),
  backgroundColor: document.querySelector('#background-color'),
  gridVisible: document.querySelector('#grid-visible'),
  gridSize: document.querySelector('#grid-size'),
  keyLight: document.querySelector('#key-light'),
  keyLightValue: document.querySelector('#key-light-value'),
  hemiLight: document.querySelector('#hemi-light'),
  hemiLightValue: document.querySelector('#hemi-light-value'),
  resetStage: document.querySelector('#reset-stage'),
  rigMode: document.querySelector('#rig-mode'),
  rigSearch: document.querySelector('#rig-search'),
  skeletonVisible: document.querySelector('#skeleton-visible'),
  selectedAxesVisible: document.querySelector('#selected-axes-visible'),
  rigCount: document.querySelector('#rig-count'),
  boneList: document.querySelector('#bone-list'),
  boneEmpty: document.querySelector('#bone-empty'),
  boneName: document.querySelector('#bone-name'),
  boneSource: document.querySelector('#bone-source'),
  boneParent: document.querySelector('#bone-parent'),
  boneChildren: document.querySelector('#bone-children'),
  boneLocalPosition: document.querySelector('#bone-local-position'),
  boneLocalRotation: document.querySelector('#bone-local-rotation'),
  boneWorldPosition: document.querySelector('#bone-world-position'),
  boneRotationControls: document.querySelector('#bone-rotation-controls'),
  boneRotationRanges: [...document.querySelectorAll('.bone-rotation-range')],
  boneRotationNumbers: [...document.querySelectorAll('.bone-rotation-number')],
  boneResetRotation: document.querySelector('#bone-reset-rotation'),
  movePlay: document.querySelector('#move-play'),
  moveReset: document.querySelector('#move-reset'),
  moveSpeed: document.querySelector('#move-speed'),
  moveSpeedValue: document.querySelector('#move-speed-value'),
  moveHelpers: document.querySelector('#move-helpers'),
  moveFootLock: document.querySelector('#move-foot-lock'),
  moveCount: document.querySelector('#move-count'),
  moveList: document.querySelector('#move-list'),
  moveActive: document.querySelector('#move-active'),
  movePhase: document.querySelector('#move-phase'),
  movePlanted: document.querySelector('#move-planted'),
  moveCorrection: document.querySelector('#move-correction'),
  avaPlay: document.querySelector('#ava-play'),
  avaStop: document.querySelector('#ava-stop'),
  avaCount: document.querySelector('#ava-count'),
  avaList: document.querySelector('#ava-list'),
  avaActive: document.querySelector('#ava-active'),
  avaDuration: document.querySelector('#ava-duration'),
  avaTracks: document.querySelector('#ava-tracks'),
  avaSpeed: document.querySelector('#ava-speed'),
  avaSpeedValue: document.querySelector('#ava-speed-value'),
  avaStageInputs: [...document.querySelectorAll('input[name="ava-stage"]')],
  avaStageActive: document.querySelector('#ava-stage-active'),
  avaAnalysisState: document.querySelector('#ava-analysis-state'),
  avaAnalysisFps: document.querySelector('#ava-analysis-fps'),
  avaAnalysisKeys: document.querySelector('#ava-analysis-keys'),
  avaAnalysisTracks: document.querySelector('#ava-analysis-tracks'),
  avaAnalysisGround: document.querySelector('#ava-analysis-ground'),
  avaAnalysisPenetration: document.querySelector('#ava-analysis-penetration'),
  avaAnalysisMeshY: document.querySelector('#ava-analysis-mesh-y'),
  avaAnalysisHipY: document.querySelector('#ava-analysis-hip-y'),
  avaAnalysisHipTravel: document.querySelector('#ava-analysis-hip-travel'),
  avaAnalysisLeftFoot: document.querySelector('#ava-analysis-left-foot'),
  avaAnalysisRightFoot: document.querySelector('#ava-analysis-right-foot'),
  avaAnalysisContacts: document.querySelector('#ava-analysis-contacts'),
  avaAnalysisLayers: document.querySelector('#ava-analysis-layers'),
  avaContactList: document.querySelector('#ava-contact-list'),
  metaSource: document.querySelector('#meta-source'),
  metaFormat: document.querySelector('#meta-format'),
  metaMeshes: document.querySelector('#meta-meshes'),
  metaTriangles: document.querySelector('#meta-triangles'),
};

const defaultStage = {
  backgroundColor: '#f4f7f8',
  gridVisible: true,
  gridSize: 4,
  keyLightIntensity: 2.3,
  hemiLightIntensity: 1.7,
};
const rotationAxes = ['x', 'y', 'z'];
let selectedBoneId = null;
let selectedMoveId = null;
let selectedAvaMove = null;
let playingAvaMove = null;
let avaMoves = [];

const viewport = new AvatarViewport(els.viewport, {
  onState: setState,
  onProgress: setProgress,
  onModelLoaded: updateMetadata,
  onMoveStatus: updateMoveStatus,
  onAvaStatus: updateAvaStatus,
});
const movePresets = viewport.getMovePresets();
selectedMoveId = movePresets[0]?.id || null;

function setState(text, tone = 'neutral') {
  els.state.textContent = text;
  els.state.dataset.tone = tone;
}

function setProgress(text = '') {
  els.progress.hidden = !text;
  els.progress.textContent = text;
}

function updateMetadata(result) {
  els.metaSource.textContent = result.source || '-';
  els.metaFormat.textContent = result.format || '-';
  els.metaMeshes.textContent = result.stats.meshes.toLocaleString();
  els.metaTriangles.textContent = result.stats.triangles.toLocaleString();
  selectedBoneId = null;
  renderRigList();
  renderBoneDetails(null);
}

function activateTab(tabName) {
  els.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  els.tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tabName;
  });
  if (tabName === 'rig') {
    renderRigList();
  }
  if (tabName === 'moves') {
    renderMoveList();
    updateMoveStatus(viewport.getMoveStatus());
  }
  if (tabName === 'ava') {
    renderAvaList();
  }
  requestAnimationFrame(() => viewport.resize());
}

async function loadSelectedAvatar() {
  const path = els.select.value;
  const preset = presets.get(path);
  els.urlInput.value = path;
  await viewport.loadAvatar(path, preset?.name || path);
  await reloadAvaMoves();
}

async function loadCustomUrl() {
  const path = els.urlInput.value.trim();
  if (!path) return;
  await viewport.loadAvatar(path, path);
  await reloadAvaMoves();
}

async function loadLocalFile(file) {
  if (!file) return;
  els.urlInput.value = file.name;
  await viewport.loadLocalFile(file);
  await reloadAvaMoves();
}

async function reloadAvaMoves() {
  viewport.stopAvaMove();
  playingAvaMove = null;
  selectedAvaMove = null;
  avaMoves = await viewport.loadAvaMoves(fbxAnimations, setProgress);
  renderAvaList();
  updateAvaToolbar();
  setProgress('');
}

function getStageFormValues() {
  return {
    backgroundColor: els.backgroundColor.value,
    gridVisible: els.gridVisible.checked,
    gridSize: Number(els.gridSize.value),
    keyLightIntensity: Number(els.keyLight.value),
    hemiLightIntensity: Number(els.hemiLight.value),
  };
}

function syncStageLabels() {
  els.keyLightValue.textContent = Number(els.keyLight.value).toFixed(1);
  els.hemiLightValue.textContent = Number(els.hemiLight.value).toFixed(1);
}

function applyStageFromForm() {
  syncStageLabels();
  viewport.setStage(getStageFormValues());
}

function resetStageControls() {
  els.backgroundColor.value = defaultStage.backgroundColor;
  els.gridVisible.checked = defaultStage.gridVisible;
  els.gridSize.value = String(defaultStage.gridSize);
  els.keyLight.value = String(defaultStage.keyLightIntensity);
  els.hemiLight.value = String(defaultStage.hemiLightIntensity);
  applyStageFromForm();
}

function renderMoveList() {
  els.moveCount.textContent = String(movePresets.length);
  els.moveList.textContent = '';

  movePresets.forEach((move) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'move-item';
    button.dataset.moveId = move.id;
    button.classList.toggle('is-selected', move.id === selectedMoveId);
    button.textContent = move.name;
    button.addEventListener('click', () => selectMove(move.id));
    els.moveList.appendChild(button);
  });
}

function selectMove(id) {
  selectedMoveId = id;
  viewport.setMovePreset(id);
  renderMoveList();
}

function toggleMovePlayback() {
  const status = viewport.getMoveStatus();
  const shouldPlay = !status.playing;

  if (shouldPlay) {
    els.autoRotate.checked = false;
    viewport.setAutoRotate(false);
  }
  viewport.setMovePlaying(shouldPlay);
}

function resetMovePlayback() {
  viewport.resetMove();
  updateMoveStatus(viewport.getMoveStatus());
}

function applyMoveSpeed() {
  const speed = Number(els.moveSpeed.value);
  els.moveSpeedValue.textContent = `${speed.toFixed(1)}x`;
  viewport.setMoveSpeed(speed);
}

function applyMoveOptions() {
  viewport.setMoveOptions({
    showHelpers: els.moveHelpers.checked,
    footLock: els.moveFootLock.checked,
  });
}

function applyAvaSpeed() {
  const speed = Number(els.avaSpeed.value);
  els.avaSpeedValue.textContent = `${speed.toFixed(1)}x`;
  viewport.setAvaTimeScale(speed);
}

function updateMoveStatus(status) {
  const ready = Boolean(status.ready);

  els.movePlay.disabled = !ready;
  els.moveReset.disabled = !ready;
  els.movePlay.textContent = status.playing ? 'Pause' : 'Play';
  els.moveActive.textContent = ready ? status.presetName : '-';
  els.movePhase.textContent = ready ? `${Math.round(status.phase * 100)}%` : '-';
  els.movePlanted.textContent = ready && status.plantedFeet.length
    ? status.plantedFeet.join(', ')
    : '-';
  els.moveCorrection.textContent = ready
    ? formatVector(status.correction)
    : '-';
}

function renderAvaList() {
  const moves = viewport.getAvaMoves();
  els.avaCount.textContent = String(moves.length);
  els.avaList.textContent = '';

  moves.forEach((move) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fbx-item';
    button.dataset.avaName = move.name;
    button.classList.toggle('is-selected', move.name === selectedAvaMove);
    button.classList.toggle('is-playing', move.name === playingAvaMove);
    button.textContent = move.name;
    button.addEventListener('click', () => selectAvaMove(move.name));
    els.avaList.appendChild(button);
  });

  updateAvaToolbar();
  updateAvaMetadata();
}

function selectAvaMove(name) {
  selectedAvaMove = name;
  renderAvaList();
  updateAvaToolbar();
  updateAvaMetadata();
}

function updateAvaToolbar() {
  const selected = Boolean(selectedAvaMove);
  const playing = Boolean(playingAvaMove);
  const selectedIsPlaying = selectedAvaMove === playingAvaMove;

  els.avaPlay.disabled = !selected || selectedIsPlaying;
  els.avaPlay.textContent = selectedIsPlaying ? 'Playing' : 'Play';
  els.avaStop.disabled = !playing;
}

function playSelectedAva() {
  if (!selectedAvaMove) return;

  els.avaPlay.disabled = true;
  els.avaPlay.textContent = 'Baking';

  try {
    const played = viewport.playAvaMove(selectedAvaMove);
    if (!played) {
      throw new Error('Selected AVA move could not be played');
    }
    playingAvaMove = selectedAvaMove;
    els.autoRotate.checked = false;
    viewport.setAutoRotate(false);
  } catch (error) {
    console.error(error);
    setProgress(error instanceof Error ? error.message : String(error));
    playingAvaMove = null;
  } finally {
    renderAvaList();
  }
}

function stopAvaPlayback() {
  viewport.stopAvaMove();
  playingAvaMove = null;
  renderAvaList();
}

function updateAvaMetadata() {
  const move = viewport.getAvaMoves().find((m) => m.name === selectedAvaMove);
  els.avaStageActive.textContent = viewport.getAvaStage().toUpperCase();
  if (!move) {
    els.avaActive.textContent = '-';
    els.avaDuration.textContent = '-';
    els.avaTracks.textContent = '-';
    renderAvaAnalysis();
    return;
  }

  els.avaActive.textContent = move.name;
  els.avaDuration.textContent = move.ava.duration ? `${move.ava.duration.toFixed(2)}s` : '-';
  els.avaTracks.textContent = move.ava.tracks?.length ? String(move.ava.tracks.length) : '-';
  renderAvaAnalysis();
}

function updateAvaStatus(status) {
  const statusTime = document.querySelector('#ava-status-time');
  if (statusTime) {
    const pct = status.duration > 0 ? Math.round((status.time / status.duration) * 100) : 0;
    statusTime.textContent = `${status.time.toFixed(2)}s / ${status.duration.toFixed(2)}s (${pct}%)`;
  }
}

function renderAvaAnalysis() {
  const playable = viewport.getLastAvaPlayable();
  const stage = viewport.getAvaStage();
  const analysis = playable?.name === selectedAvaMove && playable?.format === stage
    ? playable.analysis
    : null;

  els.avaAnalysisState.textContent = analysis ? stage.toUpperCase() : '-';
  els.avaAnalysisFps.textContent = analysis ? `${formatOne(analysis.timing.nominalFrameRate)} fps` : '-';
  els.avaAnalysisKeys.textContent = analysis ? String(analysis.timing.keyframeCount) : '-';
  els.avaAnalysisTracks.textContent = analysis
    ? `${analysis.tracks.total} (${analysis.tracks.quaternion}q/${analysis.tracks.position}p)`
    : '-';
  els.avaAnalysisGround.textContent = analysis
    ? `floor ${formatMeters(analysis.floor.configuredHeight)}  est ${formatMeters(analysis.floor.estimatedHeight)}`
    : '-';
  els.avaAnalysisPenetration.textContent = analysis
    ? `${formatMeters(analysis.floor.penetrationDepth)} (${analysis.floor.belowFloorSamples})`
    : '-';
  els.avaAnalysisMeshY.textContent = analysis?.bounds
    ? `${formatMeters(analysis.bounds.minY.min)} .. ${formatMeters(analysis.bounds.minY.max)}`
    : '-';
  els.avaAnalysisHipY.textContent = analysis?.hips
    ? `${formatMeters(analysis.hips.y.min)} .. ${formatMeters(analysis.hips.y.max)}`
    : '-';
  els.avaAnalysisHipTravel.textContent = analysis?.hips
    ? `${formatMeters(analysis.hips.horizontalTravel)} xz / ${formatMeters(analysis.hips.travel)}`
    : '-';
  els.avaAnalysisLeftFoot.textContent = analysis?.feet?.leftFoot
    ? formatFootSummary(analysis.feet.leftFoot)
    : '-';
  els.avaAnalysisRightFoot.textContent = analysis?.feet?.rightFoot
    ? formatFootSummary(analysis.feet.rightFoot)
    : '-';
  els.avaAnalysisContacts.textContent = analysis
    ? `${analysis.contacts.length} windows`
    : '-';
  els.avaAnalysisLayers.textContent = playable?.layers?.length
    ? playable.layers.map((layer) => layer.type).join(', ')
    : '-';
  renderContactList(analysis?.contacts || []);
}

function renderContactList(contacts) {
  els.avaContactList.textContent = '';

  contacts.slice(0, 8).forEach((contact) => {
    const item = document.createElement('div');
    item.className = 'contact-item';

    const title = document.createElement('strong');
    title.textContent = `${contact.bone} ${formatSeconds(contact.start)}-${formatSeconds(contact.end)}`;

    const details = document.createElement('span');
    details.textContent = `anchor ${formatVectorArray(contact.anchor)}  samples ${contact.sampleCount}  conf ${formatOne(contact.confidence)}`;

    item.append(title, details);
    els.avaContactList.appendChild(item);
  });

  if (contacts.length > 8) {
    const extra = document.createElement('div');
    extra.className = 'contact-item';
    extra.textContent = `${contacts.length - 8} more contact windows`;
    els.avaContactList.appendChild(extra);
  }
}

function formatFootSummary(summary) {
  return `y ${formatMeters(summary.worldY.min)}..${formatMeters(summary.worldY.max)}  v ${formatMeters(summary.averageVelocity)}/s`;
}

function formatVectorArray(values) {
  if (!Array.isArray(values) || values.length < 3) return '-';
  return `x ${formatNumber(values[0])} y ${formatNumber(values[1])} z ${formatNumber(values[2])}`;
}

function formatSeconds(value) {
  return `${Number(value).toFixed(2)}s`;
}

function formatMeters(value) {
  return `${formatNumber(value)}m`;
}

function formatOne(value) {
  return Number(value).toFixed(1);
}

function renderRigList() {
  const mode = els.rigMode.value;
  const filter = els.rigSearch.value.trim().toLowerCase();
  const info = viewport.getRigInfo(mode);
  const bones = info.bones.filter((bone) => {
    if (!filter) return true;
    return (
      bone.name.toLowerCase().includes(filter) ||
      bone.sourceName.toLowerCase().includes(filter) ||
      bone.parentName.toLowerCase().includes(filter)
    );
  });

  els.rigCount.textContent = String(bones.length);
  els.boneList.textContent = '';
  els.boneEmpty.hidden = bones.length > 0;

  bones.forEach((bone) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bone-item';
    button.dataset.boneId = bone.id;
    button.classList.toggle('is-selected', bone.id === selectedBoneId);

    const name = document.createElement('span');
    name.className = 'bone-item-name';
    name.textContent = bone.name;

    const source = document.createElement('span');
    source.className = 'bone-item-source';
    source.textContent = bone.sourceName;

    button.append(name, source);
    button.addEventListener('click', () => selectRigBone(bone.id));
    els.boneList.appendChild(button);
  });
}

function selectRigBone(id) {
  selectedBoneId = id;
  const details = viewport.selectBone(id, els.rigMode.value);
  renderBoneDetails(details);
  renderRigList();
}

function renderBoneDetails(details) {
  els.boneName.textContent = details?.name || '-';
  els.boneSource.textContent = details?.sourceName || '-';
  els.boneParent.textContent = details?.parentName || '-';
  els.boneChildren.textContent = details ? String(details.childCount) : '-';
  els.boneLocalPosition.textContent = details ? formatVector(details.localPosition) : '-';
  els.boneLocalRotation.textContent = details ? formatRotation(details.localRotation) : '-';
  els.boneWorldPosition.textContent = details ? formatVector(details.worldPosition) : '-';
  syncBoneRotationControls(details?.localRotation || null);
}

function clearRigSelection() {
  selectedBoneId = null;
  viewport.selectBone('', els.rigMode.value);
  renderBoneDetails(null);
  renderRigList();
}

function syncBoneRotationControls(rotation) {
  const enabled = Boolean(rotation);
  const values = rotation || { x: 0, y: 0, z: 0 };

  els.boneRotationControls.disabled = !enabled;
  rotationAxes.forEach((axis) => {
    setRotationControlValue(axis, values[axis]);
  });
}

function handleBoneRotationInput(event) {
  const input = event.currentTarget;
  const axis = input.dataset.axis;
  if (!rotationAxes.includes(axis) || input.value === '') return;

  const value = Number(input.value);
  if (!Number.isFinite(value)) return;

  setRotationControlValue(axis, clampRotationValue(value));
  const details = viewport.setSelectedBoneRotation(readBoneRotationControls());
  renderBoneDetails(details);
}

function resetSelectedBoneRotation() {
  const details = viewport.resetSelectedBoneRotation();
  renderBoneDetails(details);
}

function readBoneRotationControls() {
  return rotationAxes.reduce((rotation, axis) => {
    const input = findRotationNumber(axis);
    rotation[axis] = Number(input?.value || 0);
    return rotation;
  }, {});
}

function setRotationControlValue(axis, value) {
  const formatted = formatRotationInput(value);
  const range = findRotationRange(axis);
  const number = findRotationNumber(axis);

  if (range) range.value = formatted;
  if (number) number.value = formatted;
}

function findRotationRange(axis) {
  return els.boneRotationRanges.find((input) => input.dataset.axis === axis);
}

function findRotationNumber(axis) {
  return els.boneRotationNumbers.find((input) => input.dataset.axis === axis);
}

function clampRotationValue(value) {
  return Math.max(-180, Math.min(180, value));
}

function formatRotationInput(value) {
  const cleanValue = Math.abs(Number(value)) < 0.0005 ? 0 : Number(value);
  return cleanValue.toFixed(1);
}

function formatVector(vector) {
  return `x ${formatNumber(vector.x)}  y ${formatNumber(vector.y)}  z ${formatNumber(vector.z)}`;
}

function formatRotation(rotation) {
  return `x ${formatNumber(rotation.x)}°  y ${formatNumber(rotation.y)}°  z ${formatNumber(rotation.z)}°`;
}

function formatNumber(value) {
  return Number(value).toFixed(3);
}

els.tabButtons.forEach((button) => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
});
els.select.addEventListener('change', loadSelectedAvatar);
els.loadUrl.addEventListener('click', loadCustomUrl);
els.urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadCustomUrl();
  }
});
els.fileInput.addEventListener('change', (event) => loadLocalFile(event.target.files?.[0]));
els.resetCamera.addEventListener('click', () => viewport.resetCamera());
els.autoRotate.addEventListener('change', () => viewport.setAutoRotate(els.autoRotate.checked));
els.backgroundColor.addEventListener('input', applyStageFromForm);
els.gridVisible.addEventListener('change', applyStageFromForm);
els.gridSize.addEventListener('change', applyStageFromForm);
els.keyLight.addEventListener('input', applyStageFromForm);
els.hemiLight.addEventListener('input', applyStageFromForm);
els.resetStage.addEventListener('click', resetStageControls);
els.movePlay.addEventListener('click', toggleMovePlayback);
els.moveReset.addEventListener('click', resetMovePlayback);
els.moveSpeed.addEventListener('input', applyMoveSpeed);
els.moveHelpers.addEventListener('change', applyMoveOptions);
els.moveFootLock.addEventListener('change', applyMoveOptions);
els.avaPlay.addEventListener('click', playSelectedAva);
els.avaStop.addEventListener('click', stopAvaPlayback);
els.avaSpeed.addEventListener('input', applyAvaSpeed);
els.avaStageInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    viewport.setAvaStage(input.value);
    updateAvaMetadata();
    if (playingAvaMove) {
      playSelectedAva();
    }
  });
});
els.rigMode.addEventListener('change', clearRigSelection);
els.rigSearch.addEventListener('input', renderRigList);
els.skeletonVisible.addEventListener('change', () => {
  viewport.setSkeletonVisible(els.skeletonVisible.checked);
});
els.selectedAxesVisible.addEventListener('change', () => {
  viewport.setSelectedAxesVisible(els.selectedAxesVisible.checked);
});
[...els.boneRotationRanges, ...els.boneRotationNumbers].forEach((input) => {
  input.addEventListener('input', handleBoneRotationInput);
});
els.boneResetRotation.addEventListener('click', resetSelectedBoneRotation);
window.addEventListener('resize', () => viewport.resize());

activateTab('viewer');
resetStageControls();
renderMoveList();
applyMoveSpeed();
applyMoveOptions();
applyAvaSpeed();
updateMoveStatus(viewport.getMoveStatus());
viewport.resize();
viewport.start();

const initialModel = new URLSearchParams(window.location.search).get('model');
if (initialModel) {
  if (presets.has(initialModel)) {
    els.select.value = initialModel;
  }
  els.urlInput.value = initialModel;
  await viewport.loadAvatar(initialModel, presets.get(initialModel)?.name || initialModel);
  await reloadAvaMoves();
} else {
  loadSelectedAvatar();
}
