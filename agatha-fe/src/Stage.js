import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_STAGE = {
  backgroundColor: '#f4f7f8',
  gridVisible: true,
  gridSize: 4,
  keyLightIntensity: 2.3,
  hemiLightIntensity: 1.7,
  autoRotate: true,
};

export class Stage {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.camera.position.set(0, 1.35, 3.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1.2, 0);
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 12;

    this.keyLight = new THREE.DirectionalLight(0xffffff, DEFAULT_STAGE.keyLightIntensity);
    this.keyLight.position.set(2.5, 4, 3);
    this.scene.add(this.keyLight);

    this.hemiLight = new THREE.HemisphereLight(0xddeeff, 0x887766, DEFAULT_STAGE.hemiLightIntensity);
    this.scene.add(this.hemiLight);

    this.grid = null;
    this.stage = { ...DEFAULT_STAGE };
    this.setStage(this.stage);
  }

  setStage(settings = {}) {
    this.stage = {
      ...this.stage,
      ...settings,
    };
    this.scene.background = new THREE.Color(this.stage.backgroundColor);
    this.keyLight.intensity = this.stage.keyLightIntensity;
    this.hemiLight.intensity = this.stage.hemiLightIntensity;
    this.updateGrid();
  }

  setAutoRotate(enabled) {
    this.setStage({ autoRotate: Boolean(enabled) });
  }

  updateGrid() {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry?.dispose();
      const material = this.grid.material ? [this.grid.material].flat() : [];
      material.forEach((item) => item.dispose?.());
      this.grid = null;
    }

    if (!this.stage.gridVisible) {
      return;
    }

    this.grid = new THREE.GridHelper(
      this.stage.gridSize,
      Math.max(4, this.stage.gridSize * 5),
      0x9aa6a8,
      0xd7dddf,
    );
    this.grid.position.y = 0;
    this.scene.add(this.grid);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  frameObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      this.camera.position.set(0, 1.35, 3.2);
      this.controls.target.set(0, 1.2, 0);
      this.controls.update();
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const distance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    const viewDistance = Math.max(distance * 1.35, 1.4);

    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + maxSize * 0.12, center.z + viewDistance);
    this.camera.near = Math.max(viewDistance / 100, 0.01);
    this.camera.far = Math.max(viewDistance * 100, 100);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
