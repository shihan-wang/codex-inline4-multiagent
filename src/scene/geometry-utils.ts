import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';

export function roundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius = Math.min(width, height, depth) * 0.08,
  bevelSegments = 2,
): BufferGeometry {
  const halfW = width / 2;
  const halfH = height / 2;
  const r = Math.min(radius, halfW - 0.01, halfH - 0.01);
  const shape = new Shape();
  shape.moveTo(-halfW + r, -halfH);
  shape.lineTo(halfW - r, -halfH);
  shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + r);
  shape.lineTo(halfW, halfH - r);
  shape.quadraticCurveTo(halfW, halfH, halfW - r, halfH);
  shape.lineTo(-halfW + r, halfH);
  shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - r);
  shape.lineTo(-halfW, -halfH + r);
  shape.quadraticCurveTo(-halfW, -halfH, -halfW + r, -halfH);

  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(0.1, depth - radius),
    bevelEnabled: true,
    bevelThickness: radius / 2,
    bevelSize: radius / 2,
    bevelSegments,
    curveSegments: 5,
  });
  geometry.center();
  return geometry;
}

export function frustumBoxGeometry(
  topWidth: number,
  topDepth: number,
  bottomWidth: number,
  bottomDepth: number,
  height: number,
): BufferGeometry {
  const vertices = [
    -topWidth / 2, height / 2, -topDepth / 2,
    topWidth / 2, height / 2, -topDepth / 2,
    topWidth / 2, height / 2, topDepth / 2,
    -topWidth / 2, height / 2, topDepth / 2,
    -bottomWidth / 2, -height / 2, -bottomDepth / 2,
    bottomWidth / 2, -height / 2, -bottomDepth / 2,
    bottomWidth / 2, -height / 2, bottomDepth / 2,
    -bottomWidth / 2, -height / 2, bottomDepth / 2,
  ];
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function tubeBetween(
  points: Vector3[],
  radius: number,
  tubularSegments = 32,
  radialSegments = 8,
): TubeGeometry {
  const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.35);
  return new TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

export function cylinderAlongX(
  radius: number,
  length: number,
  radialSegments = 24,
): CylinderGeometry {
  const geometry = new CylinderGeometry(radius, radius, length, radialSegments);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}

export function createBolt(
  radius: number,
  length: number,
  material: MeshStandardMaterial,
): Mesh {
  const geometry = new CylinderGeometry(radius, radius, length, 6);
  return new Mesh(geometry, material);
}

export function arcPoints(
  center: Vector3,
  radius: number,
  start: number,
  end: number,
  segments = 12,
  plane: 'xy' | 'yz' = 'yz',
): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = start + ((end - start) * i) / segments;
    points.push(
      plane === 'yz'
        ? new Vector3(center.x, center.y + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius)
        : new Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, center.z),
    );
  }
  return points;
}

export function roundedRectShape(width: number, height: number, radius: number): Shape {
  const pts = [
    new Vector2(-width / 2 + radius, -height / 2),
    new Vector2(width / 2 - radius, -height / 2),
  ];
  const shape = new Shape(pts);
  shape.lineTo(width / 2 - radius, -height / 2);
  shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
  shape.lineTo(width / 2, height / 2 - radius);
  shape.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
  shape.lineTo(-width / 2 + radius, height / 2);
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
  shape.lineTo(-width / 2, -height / 2 + radius);
  shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);
  return shape;
}

export function simpleBox(width: number, height: number, depth: number): BoxGeometry {
  const geometry = new BoxGeometry(width, height, depth, 1, 1, 1);
  geometry.computeVertexNormals();
  return geometry;
}

