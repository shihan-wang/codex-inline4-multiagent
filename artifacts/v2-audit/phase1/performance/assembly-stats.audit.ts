import { describe, it } from 'vitest';
import { BufferGeometry, Material, Mesh, Object3D, Points } from 'three';
import { createEngineAssembly } from '../../../../src/scene/assembly';

describe('read-only assembly audit probe', () => {
  it('reports retained scene complexity without modifying application code', () => {
    const assembly = createEngineAssembly();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const types: Record<string, number> = {};
    let objects = 0;
    let meshes = 0;
    let points = 0;
    let castShadow = 0;
    let receiveShadow = 0;
    let vertices = 0;
    let triangles = 0;
    let pickableDescendants = 0;

    assembly.root.traverse((object: Object3D) => {
      objects += 1;
      types[object.type] = (types[object.type] ?? 0) + 1;
      if (object instanceof Mesh || object instanceof Points) {
        if (object instanceof Mesh) meshes += 1;
        if (object instanceof Points) points += 1;
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => materials.add(material));
        if (object.castShadow) castShadow += 1;
        if (object.receiveShadow) receiveShadow += 1;
      }
    });
    geometries.forEach((geometry) => {
      const positionCount = geometry.getAttribute('position')?.count ?? 0;
      vertices += positionCount;
      triangles += geometry.index ? geometry.index.count / 3 : positionCount / 3;
    });
    assembly.pickables.forEach((pickable) => {
      pickable.traverse(() => { pickableDescendants += 1; });
    });

    const report = {
      objects,
      meshes,
      points,
      uniqueGeometries: geometries.size,
      uniqueMaterials: materials.size,
      vertices,
      triangles,
      castShadow,
      receiveShadow,
      pickableRoots: assembly.pickables.length,
      pickableDescendants,
      types,
      materialTypes: [...materials].reduce<Record<string, number>>((result, material) => {
        result[material.type] = (result[material.type] ?? 0) + 1;
        return result;
      }, {}),
    };
    console.log(`ASSEMBLY_AUDIT=${JSON.stringify(report)}`);
    assembly.dispose();
  });
});
