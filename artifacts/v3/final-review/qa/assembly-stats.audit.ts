import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import {
  BufferGeometry,
  InstancedMesh,
  Material,
  Mesh,
  Object3D,
  Points,
} from 'three';
import { createEngineAssembly } from '../../../../src/scene/assembly';

describe('v3 final independent assembly inventory', () => {
  it('records resources, instances, and shadow complexity', () => {
    const assembly = createEngineAssembly();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const geometryTypes: Record<string, number> = {};
    const materialTypes: Record<string, number> = {};
    const roles: Record<string, number> = {};
    let objects = 0;
    let meshes = 0;
    let points = 0;
    let instancedMeshes = 0;
    let renderedInstances = 0;
    let castShadow = 0;
    let receiveShadow = 0;
    let vertices = 0;
    let triangles = 0;
    let geometryBytes = 0;
    let transparentMaterials = 0;

    assembly.root.traverse((object: Object3D) => {
      objects += 1;
      const role = String(object.userData.visualRole ?? 'unspecified');
      roles[role] = (roles[role] ?? 0) + 1;
      if (!(object instanceof Mesh || object instanceof Points)) return;
      if (object instanceof Mesh) meshes += 1;
      if (object instanceof Points) points += 1;
      if (object instanceof InstancedMesh) {
        instancedMeshes += 1;
        renderedInstances += object.count;
      }
      if (object.castShadow) castShadow += 1;
      if (object.receiveShadow) receiveShadow += 1;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    });

    geometries.forEach((geometry) => {
      geometryTypes[geometry.type] = (geometryTypes[geometry.type] ?? 0) + 1;
      const positionCount = geometry.getAttribute('position')?.count ?? 0;
      vertices += positionCount;
      triangles += geometry.index ? geometry.index.count / 3 : positionCount / 3;
      Object.values(geometry.attributes).forEach((attribute) => {
        geometryBytes += attribute.array.byteLength;
      });
      if (geometry.index) geometryBytes += geometry.index.array.byteLength;
    });
    materials.forEach((material) => {
      materialTypes[material.type] = (materialTypes[material.type] ?? 0) + 1;
      if (material.transparent) transparentMaterials += 1;
    });

    const report = {
      objects,
      meshes,
      points,
      instancedMeshes,
      renderedInstances,
      uniqueGeometries: geometries.size,
      uniqueMaterials: materials.size,
      vertices,
      triangles,
      geometryBytes,
      castShadow,
      receiveShadow,
      transparentMaterials,
      pickableRoots: assembly.pickables.length,
      geometryTypes,
      materialTypes,
      roles,
    };
    writeFileSync(
      'artifacts/v3/final-review/qa/assembly-stats.json',
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(`V3_FINAL_ASSEMBLY=${JSON.stringify(report)}`);
    assembly.dispose();
  });
});
