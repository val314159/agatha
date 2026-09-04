import * as THREE from 'three';

export function getHumanoidBoneNode(humanoid, name) {
  const node = humanoid.getNormalizedBoneNode?.(name);
  if (node) return node;

  const bone = humanoid.getNormalizedBone?.(name);
  return bone?.node || bone || null;
}

export function getWorldPosition(object) {
  object.updateWorldMatrix(true, false);
  return object.getWorldPosition(new THREE.Vector3());
}

export function applyLocalRotationOffset(object, restQuaternion, rotationDegrees = {}) {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotationDegrees.rx || 0),
    THREE.MathUtils.degToRad(rotationDegrees.ry || 0),
    THREE.MathUtils.degToRad(rotationDegrees.rz || 0),
    object.rotation.order,
  );
  const offset = new THREE.Quaternion().setFromEuler(euler);
  object.quaternion.copy(restQuaternion).multiply(offset);
}

export function vectorToObject(vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
}

export function inferFormat(path, gltf) {
  if (gltf.userData?.vrm) return 'VRM';
  const lower = path.toLowerCase();
  if (lower.endsWith('.vrm')) return 'VRM';
  if (lower.endsWith('.glb')) return 'glB';
  if (lower.endsWith('.gltf')) return 'glTF';
  return 'Model';
}

export function getModelStats(root) {
  let meshes = 0;
  let triangles = 0;

  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    if (!geometry) return;
    if (geometry.index) {
      triangles += geometry.index.count / 3;
    } else if (geometry.attributes?.position) {
      triangles += geometry.attributes.position.count / 3;
    }
  });

  return {
    meshes,
    triangles: Math.round(triangles),
  };
}

export function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = object.material ? [object.material].flat() : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) {
          value.dispose();
        }
      });
      material.dispose?.();
    });
  });
}
