import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { disposeObject, inferFormat, getModelStats } from './utils.js';

export class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMLoaderPlugin(parser));
    this.fbxLoader = new FBXLoader();
    this.loadToken = 0;
  }

  async loadAvatar(path, label = path, onProgress = null) {
    const token = ++this.loadToken;
    if (onProgress) onProgress('Starting load...');

    try {
      const gltf = await this.loader.loadAsync(path, (event) => {
        if (!onProgress) return;
        if (event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(`Loading ${percent}%`);
        } else if (event.loaded) {
          onProgress(`${Math.round(event.loaded / 1024).toLocaleString()} KB loaded`);
        }
      });

      if (token !== this.loadToken) return null;

      const vrm = gltf.userData?.vrm || null;
      const root = vrm ? vrm.scene : gltf.scene;

      if (vrm) {
        VRMUtils.rotateVRM0?.(vrm);
      }

      return {
        source: label,
        format: inferFormat(path, gltf),
        root,
        vrm,
        stats: getModelStats(root),
      };
    } catch (error) {
      if (token !== this.loadToken) return null;
      throw error;
    }
  }

  async loadFbxAnimation(path, label = path, onProgress = null) {
    if (onProgress) onProgress(`Loading ${label}...`);

    const root = await this.fbxLoader.loadAsync(path, (event) => {
      if (!onProgress) return;
      if (event.total > 0) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(`Loading ${percent}%`);
      } else if (event.loaded) {
        onProgress(`${Math.round(event.loaded / 1024).toLocaleString()} KB loaded`);
      }
    });

    const clips = root.animations || [];
    const duration = clips.reduce((max, clip) => Math.max(max, clip.duration), 0);
    const tracks = clips.reduce((total, clip) => total + clip.tracks.length, 0);

    let bones = 0;
    let nodes = 0;
    root.traverse((object) => {
      nodes += 1;
      if (object.isBone) bones += 1;
    });

    if (onProgress) onProgress('');
    return {
      source: label,
      path,
      rootName: root.name || '-',
      clipCount: clips.length,
      clips,
      duration,
      tracks,
      bones,
      nodes,
      root,
    };
  }

  async inspectFbxAnimation(path, label = path, onProgress = null) {
    if (onProgress) onProgress(`Inspecting ${label}...`);

    const root = await this.fbxLoader.loadAsync(path, (event) => {
      if (!onProgress) return;
      if (event.total > 0) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(`Inspecting ${percent}%`);
      } else if (event.loaded) {
        onProgress(`${Math.round(event.loaded / 1024).toLocaleString()} KB inspected`);
      }
    });

    try {
      let bones = 0;
      let nodes = 0;
      root.traverse((object) => {
        nodes += 1;
        if (object.isBone) {
          bones += 1;
        }
      });

      const clips = (root.animations || []).map((clip) => ({
        name: clip.name || label,
        duration: clip.duration || 0,
        tracks: clip.tracks?.length || 0,
      }));
      const duration = clips.reduce((max, clip) => Math.max(max, clip.duration), 0);
      const tracks = clips.reduce((total, clip) => total + clip.tracks, 0);

      if (onProgress) onProgress('');
      return {
        source: label,
        path,
        rootName: root.name || '-',
        clipCount: clips.length,
        clips,
        duration,
        tracks,
        bones,
        nodes,
      };
    } finally {
      disposeObject(root);
    }
  }
}
