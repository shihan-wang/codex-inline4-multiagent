import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  CameraPreset,
  EngineSceneBridge,
  SceneInteractionHandlers,
  SimulationSnapshot,
  ViewMode,
} from '../types';
import { createEngineAssembly } from './assembly';
import { CAMERA_PRESETS, EXPLODED_HERO_PRESET } from './constants';
import type { EngineAssembly } from './types';

interface CameraGoal {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  immediate: boolean;
}

interface ProjectedLabel {
  element: HTMLDivElement;
  anchor: Vector3;
  presets: readonly CameraPreset[];
}

interface LabelSpec {
  nameZh: string;
  nameEn: string;
  anchor: Vector3;
  presets: readonly CameraPreset[];
}

const LABEL_SPECS: readonly LabelSpec[] = [
  { nameZh: '气缸体', nameEn: 'BLOCK', anchor: new Vector3(0, 150, 112), presets: ['hero', 'front', 'side'] },
  { nameZh: '气缸盖', nameEn: 'CYLINDER HEAD', anchor: new Vector3(-105, 323, 113), presets: ['hero', 'front', 'side'] },
  { nameZh: '油底壳', nameEn: 'OIL SUMP', anchor: new Vector3(-90, -145, 92), presets: ['hero', 'front', 'side'] },
  { nameZh: '曲轴', nameEn: 'CRANKSHAFT', anchor: new Vector3(-75, 0, 42), presets: ['hero', 'front', 'side', 'cranktrain'] },
  { nameZh: '活塞', nameEn: 'PISTON', anchor: new Vector3(52, 190, 22), presets: ['cranktrain'] },
  { nameZh: '连杆', nameEn: 'CONNECTING ROD', anchor: new Vector3(52, 91, 28), presets: ['cranktrain'] },
  { nameZh: '凸轮轴', nameEn: 'CAMSHAFT', anchor: new Vector3(-120, 388, -38), presets: ['hero', 'top', 'valvetrain'] },
  { nameZh: '进气门', nameEn: 'INTAKE VALVE', anchor: new Vector3(-52, 337, -34), presets: ['valvetrain'] },
  { nameZh: '排气门', nameEn: 'EXHAUST VALVE', anchor: new Vector3(52, 337, 34), presets: ['valvetrain'] },
  { nameZh: '喷油器', nameEn: 'INJECTOR', anchor: new Vector3(96, 351, 0), presets: ['top', 'valvetrain'] },
  { nameZh: '燃烧室', nameEn: 'COMBUSTION CHAMBER', anchor: new Vector3(48, 268, 0), presets: ['valvetrain'] },
  { nameZh: '共轨', nameEn: 'COMMON RAIL', anchor: new Vector3(92, 438, -82), presets: ['hero', 'top'] },
  { nameZh: '涡轮增压器', nameEn: 'TURBOCHARGER', anchor: new Vector3(145, 235, 278), presets: ['hero', 'front', 'side'] },
  { nameZh: '进气歧管', nameEn: 'INTAKE', anchor: new Vector3(-40, 280, -224), presets: ['hero', 'front', 'side'] },
  { nameZh: '排气歧管', nameEn: 'EXHAUST', anchor: new Vector3(65, 267, 194), presets: ['hero', 'front', 'side'] },
];

class ProceduralEngineScene implements EngineSceneBridge {
  private container: HTMLElement | null = null;

  private scene: Scene | null = null;

  private camera: PerspectiveCamera | null = null;

  private renderer: WebGLRenderer | null = null;

  private controls: OrbitControls | null = null;

  private engine: EngineAssembly | null = null;

  private resizeObserver: ResizeObserver | null = null;

  private readonly raycaster = new Raycaster();

  private readonly pointer = new Vector2();

  private handlers: SceneInteractionHandlers | null = null;

  private hoverPartId: string | null = null;

  private selectedPartId: string | null = null;

  private currentViewMode: ViewMode = 'solid';

  private currentPreset: CameraPreset = 'hero';

  private exploded = false;

  private cameraGoal: CameraGoal | null = null;

  private labelLayer: HTMLDivElement | null = null;

  private readonly labels: ProjectedLabel[] = [];

  private labelsVisible = true;

  private labelUpdateElapsed = 0;

  private mounted = false;

  mount(container: HTMLElement): void {
    if (this.mounted) this.dispose();
    this.container = container;
    container.replaceChildren();

    const scene = new Scene();
    scene.background = new Color(0x071018);
    scene.fog = new FogExp2(0x071018, 0.027);

    const camera = new PerspectiveCamera(36, 1, 0.05, 70);
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.domElement.className = 'engine-canvas';
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D inline-four diesel engine');
    renderer.domElement.tabIndex = 0;
    container.append(renderer.domElement);
    this.createLabels(container);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.75;
    controls.panSpeed = 0.6;
    controls.minDistance = 4.2;
    controls.maxDistance = 28;
    controls.maxPolarAngle = Math.PI * 0.94;
    controls.screenSpacePanning = true;

    const engine = createEngineAssembly();
    engine.setViewMode(this.currentViewMode);
    scene.add(engine.root);
    this.addEnvironment(scene);

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.engine = engine;
    this.mounted = true;
    this.setCameraPreset(this.currentPreset);
    if (this.cameraGoal) this.cameraGoal.immediate = true;
    this.applyCameraGoal(1);
    this.resize();

    renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    renderer.domElement.addEventListener('click', this.onClick);
    renderer.domElement.addEventListener('dblclick', this.onDoubleClick);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  update(snapshot: SimulationSnapshot, deltaSeconds: number): void {
    if (!this.engine || !this.renderer || !this.scene || !this.camera || !this.controls) return;
    this.engine.update(snapshot, deltaSeconds);
    this.applyCameraGoal(deltaSeconds);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelUpdateElapsed += deltaSeconds;
    if (this.labelUpdateElapsed >= 1 / 30 || this.cameraGoal) {
      this.updateLabels();
      this.labelUpdateElapsed = 0;
    }
  }

  setViewMode(mode: ViewMode): void {
    this.currentViewMode = mode;
    this.engine?.setViewMode(mode);
  }

  setSectionEnabled(enabled: boolean): void {
    this.engine?.setSectionEnabled(enabled);
  }

  setCameraPreset(preset: CameraPreset): void {
    this.currentPreset = preset;
    const target = preset === 'hero' && this.exploded
      ? EXPLODED_HERO_PRESET
      : CAMERA_PRESETS[preset];
    this.cameraGoal = {
      position: target.position.clone(),
      target: target.target.clone(),
      up: target.up.clone(),
      immediate: !this.mounted,
    };
  }

  setInteractionHandlers(handlers: SceneInteractionHandlers): void {
    this.handlers = handlers;
  }

  setSelectedPart(partId: string | null): void {
    this.selectedPartId = partId;
    this.engine?.setHighlighted(partId);
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    if (this.labelLayer) this.labelLayer.hidden = !visible;
  }

  setFlowsVisible(visible: boolean): void {
    this.engine?.setFlowsVisible(visible);
  }

  setExploded(exploded: boolean): void {
    this.exploded = exploded;
    this.engine?.setExploded(exploded);
    if (this.currentPreset === 'hero') this.setCameraPreset('hero');
  }

  resetCamera(): void {
    this.setCameraPreset('hero');
  }

  resize(): void {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
      this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
      this.renderer.domElement.removeEventListener('click', this.onClick);
      this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick);
    }
    this.controls?.dispose();
    this.engine?.dispose();
    this.scene?.traverse((object) => {
      if (!(object instanceof Mesh) || object.parent === this.engine?.root) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.labelLayer?.remove();
    this.labelLayer = null;
    this.labels.length = 0;
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.engine = null;
    this.exploded = false;
    this.mounted = false;
  }

  private addEnvironment(scene: Scene): void {
    const hemisphere = new HemisphereLight(0x93cfff, 0x101419, 1.45);
    scene.add(hemisphere);
    const ambient = new AmbientLight(0x28465c, 0.72);
    scene.add(ambient);

    const key = new DirectionalLight(0xf4f8ff, 4.2);
    key.position.set(-7, 11, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0004;
    scene.add(key);

    const rim = new DirectionalLight(0x35bce8, 2.6);
    rim.position.set(7, 5, -9);
    scene.add(rim);
    const warm = new DirectionalLight(0xff8a4b, 1.25);
    warm.position.set(4, 2, 8);
    scene.add(warm);
    const frontFill = new DirectionalLight(0x9ec5d4, 1.35);
    frontFill.position.set(-10, 4, -5);
    scene.add(frontFill);

    const floor = new Mesh(
      new PlaneGeometry(32, 32),
      new MeshStandardMaterial({ color: 0x0d151b, roughness: 0.82, metalness: 0.15 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.02;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new GridHelper(28, 28, 0x274b5a, 0x172a33);
    grid.position.y = -2;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.48;
    });
    scene.add(grid);

    const backdrop = new Group();
    backdrop.name = 'studio-backdrop';
    scene.add(backdrop);
  }

  private createLabels(container: HTMLElement): void {
    const layer = document.createElement('div');
    layer.className = 'engine-label-layer';
    Object.assign(layer.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '2',
    });
    layer.hidden = !this.labelsVisible;
    for (const spec of LABEL_SPECS) {
      const label = document.createElement('div');
      label.className = 'engine-part-label';
      label.innerHTML = `<i></i><span><b>${spec.nameZh}</b><small>${spec.nameEn}</small></span>`;
      Object.assign(label.style, {
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 7px',
        border: '1px solid rgba(113, 202, 231, .28)',
        borderRadius: '2px',
        color: '#d7edf4',
        background: 'rgba(5, 14, 20, .7)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, .26)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '10px',
        lineHeight: '1.05',
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
        transform: 'translate(-50%, -50%)',
        willChange: 'transform',
      });
      const dot = label.querySelector('i');
      if (dot instanceof HTMLElement) Object.assign(dot.style, {
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: '#56d6f4',
        boxShadow: '0 0 7px #56d6f4',
      });
      const small = label.querySelector('small');
      if (small instanceof HTMLElement) Object.assign(small.style, {
        display: 'block',
        marginTop: '2px',
        color: '#6e8c96',
        fontSize: '7px',
        letterSpacing: '.13em',
      });
      layer.append(label);
      this.labels.push({ element: label, anchor: spec.anchor.clone(), presets: spec.presets });
    }
    container.append(layer);
    this.labelLayer = layer;
  }

  private updateLabels(): void {
    if (!this.labelsVisible || !this.container || !this.camera || !this.engine) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const projected = new Vector3();
    this.labels.forEach((label) => {
      if (!label.presets.includes(this.currentPreset)) {
        label.element.style.visibility = 'hidden';
        return;
      }
      projected.copy(label.anchor);
      this.engine!.root.localToWorld(projected);
      projected.project(this.camera!);
      const visible = projected.z > -1 && projected.z < 1
        && Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08;
      label.element.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) {
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;
        label.element.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
    });
  }

  private applyCameraGoal(deltaSeconds: number): void {
    if (!this.cameraGoal || !this.camera || !this.controls) return;
    if (this.cameraGoal.immediate) {
      this.camera.position.copy(this.cameraGoal.position);
      this.camera.up.copy(this.cameraGoal.up);
      this.controls.target.copy(this.cameraGoal.target);
      this.cameraGoal = null;
      this.controls.update();
      return;
    }
    const alpha = 1 - Math.exp(-Math.max(0, deltaSeconds) * 5.8);
    this.camera.position.lerp(this.cameraGoal.position, alpha);
    this.camera.up.lerp(this.cameraGoal.up, alpha).normalize();
    this.controls.target.lerp(this.cameraGoal.target, alpha);
    if (
      this.camera.position.distanceToSquared(this.cameraGoal.position) < 0.0005
      && this.controls.target.distanceToSquared(this.cameraGoal.target) < 0.0005
    ) {
      this.camera.position.copy(this.cameraGoal.position);
      this.camera.up.copy(this.cameraGoal.up);
      this.controls.target.copy(this.cameraGoal.target);
      this.cameraGoal = null;
    }
  }

  private pickPart(event: PointerEvent): string | null {
    if (!this.renderer || !this.camera || !this.engine) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.engine.pickables, true);
    for (const intersection of intersections) {
      let object: typeof intersection.object | null = intersection.object;
      let partId: string | null = null;
      let visualRole = '';
      while (object && object !== this.engine.root) {
        partId ||= typeof object.userData.partId === 'string' ? object.userData.partId : null;
        visualRole ||= typeof object.userData.visualRole === 'string' ? object.userData.visualRole : '';
        object = object.parent;
      }
      // In X-Ray mode shell castings should not prevent picking the mechanism behind them.
      if (partId && !(this.currentViewMode === 'xray' && visualRole === 'shell')) return partId;
    }
    return null;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const partId = this.pickPart(event);
    if (partId === this.hoverPartId) return;
    this.hoverPartId = partId;
    if (this.renderer) this.renderer.domElement.style.cursor = partId ? 'pointer' : 'grab';
    this.handlers?.onPartInteraction({
      type: 'hover',
      partId,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    this.hoverPartId = null;
    this.handlers?.onPartInteraction({
      type: 'hover',
      partId: null,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  private readonly onClick = (event: PointerEvent): void => {
    this.selectedPartId = this.pickPart(event);
    this.engine?.setHighlighted(this.selectedPartId);
    this.handlers?.onPartInteraction({
      type: 'select',
      partId: this.selectedPartId,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  private readonly onDoubleClick = (): void => {
    this.resetCamera();
  };
}

export function createEngineScene(): EngineSceneBridge {
  return new ProceduralEngineScene();
}

export { createEngineAssembly } from './assembly';
export { WORLD_SCALE, ENGINE_DIMENSIONS } from './constants';
export type { EngineAssembly, EngineAnimationBindings } from './types';
