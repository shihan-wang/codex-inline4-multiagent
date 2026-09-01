import { describe, expect, it } from 'vitest';
import { Points, Vector3 } from 'three';
import { FlowPath } from '../src/scene/effects';
import { MaterialModeController } from '../src/scene/materials';

describe('FlowPath', () => {
  it('updates a closed particle curve repeatedly without invalid coordinates', () => {
    const materials = new MaterialModeController();
    const flow = new FlowPath({
      id: 'test-flow',
      points: [
        new Vector3(-20, 0, 0),
        new Vector3(-5, 14, 4),
        new Vector3(12, 10, -3),
        new Vector3(20, -8, 1),
        new Vector3(0, -15, 0),
      ],
      color: 0x44ccff,
      particles: 37,
      closed: true,
    }, materials);

    for (let frame = 0; frame < 1_000; frame += 1) {
      expect(() => flow.update(1 / 120, 0.75)).not.toThrow();
    }

    const particleCloud = flow.root.children.find((child) => child instanceof Points) as Points | undefined;
    const positions = particleCloud?.geometry.getAttribute('position');
    expect(positions).toBeDefined();
    for (let index = 0; index < (positions?.count ?? 0); index += 1) {
      expect(Number.isFinite(positions?.getX(index))).toBe(true);
      expect(Number.isFinite(positions?.getY(index))).toBe(true);
      expect(Number.isFinite(positions?.getZ(index))).toBe(true);
    }

    flow.disposeGeometry();
    materials.dispose();
  });

  it('supports an open path without inventing an end-to-start tube segment', () => {
    const materials = new MaterialModeController();
    const flow = new FlowPath({
      id: 'open-flow',
      points: [
        new Vector3(0, 0, 0),
        new Vector3(10, 8, 0),
        new Vector3(22, 10, 4),
        new Vector3(35, 4, 5),
      ],
      color: 0x55ddff,
      closed: false,
      minimumActivity: 0,
    }, materials);

    expect(flow.root.userData.closed).toBe(false);
    expect(() => flow.update(1 / 60, 0)).not.toThrow();
    flow.disposeGeometry();
    materials.dispose();
  });
});
