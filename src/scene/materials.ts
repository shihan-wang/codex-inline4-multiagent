import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Plane,
  Vector3,
} from 'three';
import type { SceneViewMode, VisualRole } from './types';

export interface EngineMaterials {
  castIron: MeshStandardMaterial;
  darkCastIron: MeshStandardMaterial;
  machinedSteel: MeshStandardMaterial;
  polishedSteel: MeshPhysicalMaterial;
  aluminum: MeshStandardMaterial;
  pistonAluminum: MeshStandardMaterial;
  blackAluminum: MeshStandardMaterial;
  copper: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  intake: MeshStandardMaterial;
  exhaust: MeshStandardMaterial;
  turboHot: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  coolant: MeshPhysicalMaterial;
  oil: MeshPhysicalMaterial;
  fuel: MeshPhysicalMaterial;
  combustion: MeshStandardMaterial;
  soot: MeshStandardMaterial;
  ceramic: MeshStandardMaterial;
  gasket: MeshStandardMaterial;
  ground: MeshStandardMaterial;
}

type ManagedMaterial = Material & {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  clippingPlanes: Plane[] | null;
  userData: {
    baseOpacity?: number;
    baseTransparent?: boolean;
    baseDepthWrite?: boolean;
    visualRole?: VisualRole;
  };
};

function standard(
  color: number,
  roughness: number,
  metalness: number,
  name: string,
  role: VisualRole,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color, roughness, metalness });
  material.name = name;
  material.userData.visualRole = role;
  return material;
}

export function createEngineMaterials(): EngineMaterials {
  const castIron = standard(0x38444b, 0.72, 0.62, 'pearl graphite cast iron', 'shell');
  const darkCastIron = standard(0x3a474e, 0.64, 0.72, 'dark cast iron', 'mechanism');
  const machinedSteel = standard(0x8c969a, 0.32, 0.9, 'machined steel', 'mechanism');
  const aluminum = standard(0xabb6b8, 0.38, 0.78, 'cast aluminum', 'shell');
  const pistonAluminum = standard(0xc2c9c8, 0.3, 0.76, 'forged piston aluminum', 'mechanism');
  const blackAluminum = standard(0x222b31, 0.5, 0.68, 'powder coated aluminum', 'shell');
  const copper = standard(0xb76e45, 0.4, 0.82, 'copper alloy', 'detail');
  const rubber = standard(0x101316, 0.94, 0.05, 'rubber', 'detail');
  const intake = standard(0x3c7788, 0.5, 0.55, 'intake manifold', 'detail');
  const exhaust = standard(0x784934, 0.78, 0.6, 'exhaust manifold', 'hot');
  const turboHot = standard(0x644238, 0.82, 0.58, 'turbo turbine housing', 'hot');
  const soot = standard(0x25201d, 0.92, 0.1, 'exhaust soot', 'fluid');
  const ceramic = standard(0xd9d1b8, 0.7, 0.08, 'technical ceramic', 'detail');
  const gasket = standard(0x35302b, 0.88, 0.2, 'composite gasket', 'detail');
  const ground = standard(0x10171d, 0.82, 0.08, 'workshop floor', 'detail');

  const polishedSteel = new MeshPhysicalMaterial({
    color: 0xc6ced0,
    roughness: 0.18,
    metalness: 1,
    clearcoat: 0.25,
    clearcoatRoughness: 0.16,
  });
  polishedSteel.name = 'polished bearing steel';
  polishedSteel.userData.visualRole = 'mechanism';

  const glass = new MeshPhysicalMaterial({
    color: 0xa8c2c9,
    roughness: 0.12,
    metalness: 0,
    transmission: 0.5,
    transparent: true,
    opacity: 0.28,
    thickness: 2,
    side: DoubleSide,
    depthWrite: false,
  });
  glass.name = 'inspection glass';
  glass.userData.visualRole = 'shell';

  const coolant = new MeshPhysicalMaterial({
    color: 0x19bccc,
    emissive: new Color(0x083b45),
    emissiveIntensity: 0.7,
    roughness: 0.18,
    transparent: true,
    opacity: 0.5,
    transmission: 0.12,
    depthWrite: false,
  });
  coolant.name = 'coolant';
  coolant.userData.visualRole = 'fluid';

  const oil = new MeshPhysicalMaterial({
    color: 0xc98b12,
    emissive: new Color(0x3e2200),
    emissiveIntensity: 0.7,
    roughness: 0.26,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  oil.name = 'lubricating oil';
  oil.userData.visualRole = 'fluid';

  const fuel = new MeshPhysicalMaterial({
    color: 0xe7d63a,
    emissive: new Color(0x5b5100),
    emissiveIntensity: 1.25,
    roughness: 0.2,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  fuel.name = 'diesel fuel';
  fuel.userData.visualRole = 'fluid';

  const combustion = new MeshStandardMaterial({
    color: 0xffb21a,
    emissive: new Color(0xff4a00),
    emissiveIntensity: 5,
    roughness: 0.2,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  combustion.name = 'combustion glow';
  combustion.userData.visualRole = 'fluid';

  return {
    castIron,
    darkCastIron,
    machinedSteel,
    polishedSteel,
    aluminum,
    pistonAluminum,
    blackAluminum,
    copper,
    rubber,
    intake,
    exhaust,
    turboHot,
    glass,
    coolant,
    oil,
    fuel,
    combustion,
    soot,
    ceramic,
    gasket,
    ground,
  };
}

export class MaterialModeController {
  readonly sectionPlane = new Plane(new Vector3(0, 0, -1), 0.08);

  private readonly materials = new Set<ManagedMaterial>();

  private viewMode: SceneViewMode = 'solid';

  private sectionEnabled = false;

  register(material: Material): void {
    const managed = material as ManagedMaterial;
    if (!this.materials.has(managed)) {
      managed.userData.baseOpacity = managed.opacity;
      managed.userData.baseTransparent = managed.transparent;
      managed.userData.baseDepthWrite = managed.depthWrite;
      this.materials.add(managed);
    }
  }

  registerLibrary(library: EngineMaterials): void {
    Object.values(library).forEach((material) => this.register(material));
  }

  setViewMode(mode: SceneViewMode): void {
    this.viewMode = mode;
    this.apply();
  }

  setSectionEnabled(enabled: boolean): void {
    this.sectionEnabled = enabled;
    this.apply();
  }

  private apply(): void {
    this.materials.forEach((material) => {
      const baseOpacity = material.userData.baseOpacity ?? 1;
      const baseTransparent = material.userData.baseTransparent ?? false;
      const baseDepthWrite = material.userData.baseDepthWrite ?? true;
      const role = material.userData.visualRole ?? 'detail';
      const isShell = role === 'shell';
      const isAccessory = role === 'detail' || role === 'hot';
      const isFluid = role === 'fluid';
      const xray = this.viewMode === 'xray';

      const xrayOpacity = isShell ? 0.13 : isAccessory ? 0.34 : baseOpacity;
      const deEmphasized = xray && (isShell || isAccessory);
      material.opacity = deEmphasized ? Math.min(baseOpacity, xrayOpacity) : baseOpacity;
      material.transparent = deEmphasized ? true : baseTransparent;
      material.depthWrite = deEmphasized ? false : baseDepthWrite;
      const sectionActive = this.viewMode === 'section' || this.sectionEnabled;
      material.clippingPlanes = sectionActive && !isFluid ? [this.sectionPlane] : null;
      material.clipShadows = sectionActive;
      material.needsUpdate = true;
    });
  }

  materialsSet(): Set<Material> {
    return new Set(this.materials);
  }

  dispose(): void {
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
  }
}
