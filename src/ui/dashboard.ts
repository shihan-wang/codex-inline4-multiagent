import { ENGINE_PARTS } from '../data/parts';

export type ViewMode = 'solid' | 'xray' | 'section';
export type CameraPreset = 'isometric' | 'front' | 'side' | 'top' | 'crank' | 'combustion';
export type GlobalDashboardShortcut = 'reset' | '1' | '2' | '3' | '4' | '5' | '6';

type ShortcutEvent = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>;

export function resolveGlobalDashboardShortcut(event: ShortcutEvent): GlobalDashboardShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.code === 'KeyR') return 'reset';
  const digit = /^(?:Digit|Numpad)([1-6])$/.exec(event.code)?.[1];
  return digit ? digit as GlobalDashboardShortcut : null;
}

export interface DashboardCylinderState {
  cylinder: number;
  stroke: 'intake' | 'compression' | 'power' | 'exhaust';
  cycleAngleDeg: number;
  intakeLift: number;
  exhaustLift: number;
  injection: number;
  combustion: number;
}

export interface DashboardSnapshot {
  running: boolean;
  rpm: number;
  load: number;
  crankAngleDeg: number;
  coolantC: number;
  oilPressureBar: number;
  cylinders: DashboardCylinderState[];
}

export interface PartDetails {
  nameZh: string;
  nameEn: string;
  material: string;
  process: string;
  function: string;
  parameters: string;
  state?: string;
  system?: string;
}

export interface DashboardActions {
  onRunning(value: boolean): void;
  onRpm(value: number): void;
  onLoad(value: number): void;
  onViewMode(value: ViewMode): void;
  onCamera(value: CameraPreset): void;
  onReset(): void;
  onSelectPart(partId: string | null): void;
  onToggleLabels(value: boolean): void;
  onToggleFlows(value: boolean): void;
  onToggleExplode(value: boolean): void;
}

const STROKES: Record<DashboardCylinderState['stroke'], { zh: string; en: string; color: string }> = {
  intake: { zh: '进气', en: 'INTAKE', color: '#55c7ff' },
  compression: { zh: '压缩', en: 'COMPRESSION', color: '#f0b85b' },
  power: { zh: '做功', en: 'POWER', color: '#ff624a' },
  exhaust: { zh: '排气', en: 'EXHAUST', color: '#ba82ff' },
};

const EMPTY_INSPECTOR = `<div class="inspector-head"><span>PART INSPECTOR</span><small>零件信息</small></div>
  <div class="inspector-empty"><span class="crosshair">⌖</span><strong>选择一个零件</strong><p>将鼠标悬停或点击发动机组件<br>查看材料、工艺与实时运动状态</p></div>`;

const POWERTRAIN_TITLE_ID = 'powertrain-panel-title';
const TELEMETRY_TITLE_ID = 'telemetry-panel-title';
const INSPECTOR_TITLE_ID = 'part-inspector-title';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, title: string, value?: string): HTMLButtonElement {
  const node = element('button', 'ui-button', label);
  node.type = 'button';
  node.title = title;
  if (value) node.dataset.value = value;
  return node;
}

export class Dashboard {
  readonly root: HTMLElement;
  private readonly actions: DashboardActions;
  private running = true;
  private fpsSamples: number[] = [];
  private lastFrameTime = performance.now();
  private readonly playButton: HTMLButtonElement;
  private readonly rpmValue: HTMLElement;
  private readonly loadValue: HTMLElement;
  private readonly crankValue: HTMLElement;
  private readonly coolantValue: HTMLElement;
  private readonly oilValue: HTMLElement;
  private readonly fpsValue: HTMLElement;
  private readonly cylinderCards: HTMLElement[] = [];
  private readonly inspector: HTMLElement;
  private readonly partSelect: HTMLSelectElement;
  private readonly hint: HTMLElement;
  private readonly modeButtons = new Map<ViewMode, HTMLButtonElement>();
  private readonly presetButtons = new Map<CameraPreset, HTMLButtonElement>();
  private readonly mobileLeftButton: HTMLButtonElement;
  private readonly mobileRightButton: HTMLButtonElement;
  private displayedPartKey: string | null = null;

  constructor(mount: HTMLElement, actions: DashboardActions) {
    this.actions = actions;
    this.root = element('div', 'dashboard');
    mount.append(this.root);

    const header = element('header', 'topbar');
    const brand = element('div', 'brand');
    brand.innerHTML = `<span class="brand-mark"><i></i><i></i><i></i><i></i></span>
      <span><strong>INLINE · 4D</strong><small>FOUR-STROKE DIESEL / 四冲程柴油机</small></span>`;
    const telemetry = element('div', 'top-telemetry');
    this.fpsValue = this.metric(telemetry, 'FPS', '—');
    const order = this.metric(telemetry, 'FIRING ORDER', '1 · 3 · 4 · 2');
    order.classList.add('accent-text');
    header.append(brand, telemetry);

    const left = element('aside', 'panel panel-left');
    left.id = 'powertrain-panel';
    left.setAttribute('aria-labelledby', POWERTRAIN_TITLE_ID);
    left.append(this.panelTitle('动力控制', 'POWERTRAIN', POWERTRAIN_TITLE_ID));
    const runRow = element('div', 'run-row');
    this.playButton = button('Ⅱ', '暂停 / Pause (Space)');
    this.playButton.classList.add('play-button', 'is-active');
    this.playButton.setAttribute('aria-label', '发动机运行');
    this.playButton.setAttribute('aria-pressed', 'true');
    const runCopy = element('div', 'run-copy');
    runCopy.innerHTML = '<strong>ENGINE RUNNING</strong><span>发动机运行中</span>';
    runRow.append(this.playButton, runCopy);
    left.append(runRow);
    this.playButton.addEventListener('click', () => this.setRunning(!this.running, true));

    const rpm = this.slider('转速', 'ENGINE SPEED', 600, 2600, 20, 1200, 'rpm');
    this.rpmValue = rpm.value;
    rpm.input.addEventListener('input', () => {
      rpm.value.textContent = `${rpm.input.value} rpm`;
      this.actions.onRpm(Number(rpm.input.value));
    });
    left.append(rpm.group);

    const load = this.slider('负载', 'ENGINE LOAD', 0, 100, 1, 42, '%');
    this.loadValue = load.value;
    load.input.addEventListener('input', () => {
      load.value.textContent = `${load.input.value}%`;
      this.actions.onLoad(Number(load.input.value) / 100);
    });
    left.append(load.group);

    left.append(this.divider(), this.panelTitle('观察模式', 'VIEW MODE'));
    const modes = element('div', 'segmented mode-control');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', '观察模式');
    (['solid', 'xray', 'section'] as ViewMode[]).forEach((mode, index) => {
      const labels = { solid: '实体', xray: 'X-RAY', section: '剖切' };
      const node = button(labels[mode], mode, mode);
      const isActive = index === 0;
      node.classList.toggle('is-active', isActive);
      node.setAttribute('aria-pressed', String(isActive));
      this.modeButtons.set(mode, node);
      node.addEventListener('click', () => {
        this.setViewMode(mode);
        this.actions.onViewMode(mode);
      });
      modes.append(node);
    });
    left.append(modes);

    const toggles = element('div', 'toggle-stack');
    toggles.append(
      this.toggle('labels', '零件标签', 'PART LABELS', true, this.actions.onToggleLabels),
      this.toggle('flows', '系统流动', 'FLUID PATHS', true, this.actions.onToggleFlows),
      this.toggle('explode', '装配分解', 'EXPLODED VIEW', false, this.actions.onToggleExplode),
    );
    left.append(toggles);

    const right = element('aside', 'panel panel-right');
    right.id = 'telemetry-panel';
    right.tabIndex = 0;
    right.setAttribute('aria-labelledby', TELEMETRY_TITLE_ID);
    right.append(this.panelTitle('实时工况', 'LIVE TELEMETRY', TELEMETRY_TITLE_ID));
    const gauges = element('div', 'gauge-grid');
    this.crankValue = this.gauge(gauges, '曲轴转角', 'CRANK', '000°', '#e4ba73');
    this.coolantValue = this.gauge(gauges, '冷却液', 'COOLANT', '86°C', '#55c7ff');
    this.oilValue = this.gauge(gauges, '机油压力', 'OIL', '4.2 bar', '#e9c247');
    right.append(gauges, this.divider(), this.panelTitle('气缸循环', 'CYLINDER CYCLE'));

    const cylinders = element('div', 'cylinder-stack');
    for (let i = 1; i <= 4; i += 1) {
      const card = element('div', 'cylinder-card');
      card.innerHTML = `<span class="cylinder-index">${i}</span><span class="stroke-copy"><strong>—</strong><small>CYLINDER ${i}</small></span><span class="cycle-ring"><i></i></span>`;
      this.cylinderCards.push(card);
      cylinders.append(card);
    }
    right.append(cylinders);

    const partPicker = element('label', 'part-picker');
    partPicker.htmlFor = 'semantic-part-select';
    const partPickerCopy = element('span');
    partPickerCopy.innerHTML = '<strong>零件选择</strong><small>KEYBOARD PART SELECTOR</small>';
    this.partSelect = element('select');
    this.partSelect.id = 'semantic-part-select';
    this.partSelect.name = 'engine-part';
    this.partSelect.append(new Option('请选择零件…', ''));
    for (const [partId, metadata] of ENGINE_PARTS) {
      this.partSelect.append(new Option(`${metadata.nameZh} · ${metadata.nameEn}`, partId));
    }
    this.partSelect.addEventListener('change', () => {
      this.actions.onSelectPart(this.partSelect.value || null);
    });
    partPicker.append(partPickerCopy, this.partSelect);
    right.append(partPicker);

    this.inspector = element('section', 'inspector');
    this.inspector.setAttribute('aria-labelledby', INSPECTOR_TITLE_ID);
    this.inspector.setAttribute('aria-live', 'polite');
    this.inspector.setAttribute('aria-atomic', 'false');
    this.inspector.setAttribute('aria-relevant', 'additions');
    this.inspector.innerHTML = EMPTY_INSPECTOR;
    const inspectorHeading = this.inspector.querySelector<HTMLElement>('.inspector-head span');
    if (inspectorHeading) inspectorHeading.id = INSPECTOR_TITLE_ID;
    right.append(this.inspector);

    const bottom = element('footer', 'bottom-dock');
    const presets = element('div', 'preset-row');
    presets.setAttribute('role', 'group');
    presets.setAttribute('aria-label', '相机机位');
    const presetItems: Array<[CameraPreset, string, string]> = [
      ['isometric', '轴测', '1'], ['front', '前视', '2'], ['side', '侧视', '3'],
      ['top', '顶视', '4'], ['crank', '曲柄连杆', '5'], ['combustion', '配气 / 燃烧', '6'],
    ];
    presetItems.forEach(([value, label, key], index) => {
      const node = button(`<${key}> ${label}`, `${label} / Camera ${key}`, value);
      const isActive = index === 0;
      node.classList.toggle('is-active', isActive);
      node.setAttribute('aria-pressed', String(isActive));
      this.presetButtons.set(value, node);
      node.addEventListener('click', () => {
        this.setCameraPreset(value);
        this.actions.onCamera(value);
      });
      presets.append(node);
    });
    const reset = button('↺ 复位视角', 'Reset camera (R)');
    reset.classList.add('reset-camera');
    reset.addEventListener('click', () => {
      this.setViewMode('solid');
      this.setCameraPreset('isometric');
      this.actions.onReset();
    });
    presets.append(reset);
    bottom.append(presets);

    this.hint = element('div', 'interaction-hint');
    this.hint.innerHTML = '<span>左键旋转</span><span>右键平移</span><span>滚轮缩放</span><span>点击检查</span>';

    const legend = element('div', 'system-legend');
    legend.innerHTML = '<span><i style="--c:#55c7ff"></i>进气 / 冷却</span><span><i style="--c:#ff6b49"></i>排气 / 燃烧</span><span><i style="--c:#e9c247"></i>润滑油</span><span><i style="--c:#77ddb7"></i>燃油</span>';

    const mobileControls = element('nav', 'mobile-panel-controls');
    mobileControls.setAttribute('aria-label', '移动端面板控制');
    this.mobileLeftButton = button('☰ 控制', '打开动力控制面板');
    this.mobileLeftButton.classList.add('mobile-panel-toggle');
    this.mobileLeftButton.setAttribute('aria-controls', left.id);
    this.mobileLeftButton.setAttribute('aria-expanded', 'false');
    this.mobileLeftButton.addEventListener('click', () => this.toggleMobilePanel('left'));
    this.mobileRightButton = button('工况 ◫', '打开实时工况面板');
    this.mobileRightButton.classList.add('mobile-panel-toggle');
    this.mobileRightButton.setAttribute('aria-controls', right.id);
    this.mobileRightButton.setAttribute('aria-expanded', 'false');
    this.mobileRightButton.addEventListener('click', () => this.toggleMobilePanel('right'));
    mobileControls.append(this.mobileLeftButton, this.mobileRightButton);

    this.root.append(header, left, right, bottom, this.hint, legend, mobileControls);
    this.bindKeyboard(presetItems);
  }

  setSnapshot(snapshot: DashboardSnapshot): void {
    this.setRunning(snapshot.running, false);
    this.rpmValue.textContent = `${Math.round(snapshot.rpm)} rpm`;
    this.loadValue.textContent = `${Math.round(snapshot.load * 100)}%`;
    const crankAngle = ((snapshot.crankAngleDeg % 720) + 720) % 720;
    const displayedCrankAngle = Math.floor(crankAngle * 10) / 10;
    this.crankValue.textContent = `${displayedCrankAngle.toFixed(1).padStart(5, '0')}°`;
    this.coolantValue.textContent = `${snapshot.coolantC.toFixed(0)}°C`;
    this.oilValue.textContent = `${snapshot.oilPressureBar.toFixed(1)} bar`;

    snapshot.cylinders.forEach((cylinder, index) => {
      const card = this.cylinderCards[index];
      if (!card) return;
      const config = STROKES[cylinder.stroke];
      card.style.setProperty('--stroke', config.color);
      card.classList.toggle('is-firing', cylinder.combustion > 0.2);
      const title = card.querySelector('strong');
      const ring = card.querySelector<HTMLElement>('.cycle-ring i');
      if (title) title.textContent = `${config.zh} · ${config.en}`;
      if (ring) ring.style.transform = `rotate(${(cylinder.cycleAngleDeg / 720) * 360}deg)`;
    });
  }

  showPart(details?: PartDetails): void {
    if (!details) {
      if (this.displayedPartKey === null) return;
      this.displayedPartKey = null;
      this.inspector.classList.remove('has-part');
      this.inspector.innerHTML = EMPTY_INSPECTOR;
      const inspectorHeading = this.inspector.querySelector<HTMLElement>('.inspector-head span');
      if (inspectorHeading) inspectorHeading.id = INSPECTOR_TITLE_ID;
      return;
    }
    const partKey = `${details.nameZh}\u0000${details.nameEn}\u0000${details.system ?? 'MECHANICAL'}`;
    if (partKey === this.displayedPartKey) {
      const state = this.inspector.querySelector<HTMLElement>('.live-state dd');
      if (state && details.state && state.textContent !== details.state) state.textContent = details.state;
      return;
    }
    this.displayedPartKey = partKey;
    this.inspector.classList.add('has-part');
    this.inspector.innerHTML = `<div class="inspector-head"><span id="${INSPECTOR_TITLE_ID}">PART INSPECTOR</span><small>${details.system ?? 'MECHANICAL'}</small></div>
      <div class="part-title"><span class="part-pulse"></span><div><strong>${details.nameZh}</strong><small>${details.nameEn}</small></div></div>
      <dl>
        <div><dt>材料 / MATERIAL</dt><dd>${details.material}</dd></div>
        <div><dt>制造 / PROCESS</dt><dd>${details.process}</dd></div>
        <div><dt>功能 / FUNCTION</dt><dd>${details.function}</dd></div>
        <div><dt>参数 / SPEC</dt><dd>${details.parameters}</dd></div>
        ${details.state ? `<div class="live-state"><dt>实时 / LIVE</dt><dd>${details.state}</dd></div>` : ''}
      </dl>`;
  }

  setFps(frameTime = performance.now()): void {
    const fps = 1000 / Math.max(1, frameTime - this.lastFrameTime);
    this.lastFrameTime = frameTime;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 24) this.fpsSamples.shift();
    if (this.fpsSamples.length % 6 === 0) {
      const mean = this.fpsSamples.reduce((sum, sample) => sum + sample, 0) / this.fpsSamples.length;
      this.fpsValue.textContent = Math.round(mean).toString();
    }
  }

  setViewMode(mode: ViewMode): void {
    this.modeButtons.forEach((node, value) => {
      const isActive = value === mode;
      node.classList.toggle('is-active', isActive);
      node.setAttribute('aria-pressed', String(isActive));
    });
  }

  setCameraPreset(preset: CameraPreset): void {
    this.presetButtons.forEach((node, value) => {
      const isActive = value === preset;
      node.classList.toggle('is-active', isActive);
      node.setAttribute('aria-pressed', String(isActive));
    });
    this.closeMobilePanels();
  }

  setSelectedPart(partId: string | null): void {
    this.partSelect.value = partId && ENGINE_PARTS.has(partId.replace(/-\d+$/, ''))
      ? partId.replace(/-\d+$/, '')
      : '';
  }

  private setRunning(value: boolean, notify: boolean): void {
    this.running = value;
    this.playButton.textContent = value ? 'Ⅱ' : '▶';
    this.playButton.title = value ? '暂停 / Pause (Space)' : '运行 / Run (Space)';
    this.playButton.classList.toggle('is-active', value);
    this.playButton.setAttribute('aria-label', value ? '发动机运行' : '发动机暂停');
    this.playButton.setAttribute('aria-pressed', String(value));
    this.playButton.dataset.state = value ? 'running' : 'paused';
    const copy = this.playButton.nextElementSibling;
    if (copy) copy.innerHTML = value ? '<strong>ENGINE RUNNING</strong><span>发动机运行中</span>' : '<strong>ENGINE PAUSED</strong><span>发动机已暂停</span>';
    if (notify) this.actions.onRunning(value);
  }

  private metric(parent: HTMLElement, label: string, initial: string): HTMLElement {
    const node = element('div', 'top-metric');
    const value = element('strong', '', initial);
    node.append(element('small', '', label), value);
    parent.append(node);
    return value;
  }

  private panelTitle(zh: string, en: string, id?: string): HTMLElement {
    const node = element('div', 'panel-title');
    if (id) node.id = id;
    node.innerHTML = `<strong>${zh}</strong><span>${en}</span>`;
    return node;
  }

  private divider(): HTMLElement {
    return element('div', 'panel-divider');
  }

  private slider(zh: string, en: string, min: number, max: number, step: number, initial: number, unit: string): { group: HTMLElement; input: HTMLInputElement; value: HTMLElement } {
    const group = element('label', 'slider-group');
    const head = element('span', 'control-label');
    const value = element('strong', '', `${initial}${unit === '%' ? '%' : ` ${unit}`}`);
    head.innerHTML = `<span>${zh}<small>${en}</small></span>`;
    head.append(value);
    const input = element('input');
    input.type = 'range';
    input.min = min.toString();
    input.max = max.toString();
    input.step = step.toString();
    input.value = initial.toString();
    group.append(head, input);
    return { group, input, value };
  }

  private toggle(id: string, zh: string, en: string, checked: boolean, callback: (value: boolean) => void): HTMLElement {
    const label = element('label', 'toggle-row');
    const input = element('input');
    input.type = 'checkbox';
    input.id = `toggle-${id}`;
    input.checked = checked;
    const copy = element('span');
    copy.innerHTML = `<strong>${zh}</strong><small>${en}</small>`;
    const visual = element('i', 'toggle-visual');
    label.append(input, copy, visual);
    input.addEventListener('change', () => callback(input.checked));
    return label;
  }

  private gauge(parent: HTMLElement, zh: string, en: string, initial: string, color: string): HTMLElement {
    const node = element('div', 'gauge');
    node.style.setProperty('--gauge', color);
    node.innerHTML = `<span><small>${en}</small>${zh}</span>`;
    const value = element('strong', '', initial);
    node.append(value);
    parent.append(node);
    return value;
  }

  private bindKeyboard(presets: Array<[CameraPreset, string, string]>): void {
    window.addEventListener('keydown', (event) => {
      const shortcut = resolveGlobalDashboardShortcut(event);
      if (shortcut !== null) {
        event.preventDefault();
        if (shortcut === 'reset') {
          this.setViewMode('solid');
          this.setCameraPreset('isometric');
          this.actions.onReset();
        } else {
          const preset = presets.find(([, , key]) => key === shortcut);
          if (preset) {
            this.setCameraPreset(preset[0]);
            this.actions.onCamera(preset[0]);
          }
        }
        return;
      }

      if (event.target instanceof HTMLInputElement
        || event.target instanceof HTMLButtonElement
        || event.target instanceof HTMLSelectElement
        || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        this.setRunning(!this.running, true);
      } else if (event.key === 'Escape') {
        this.closeMobilePanels();
      }
    });
  }

  private toggleMobilePanel(side: 'left' | 'right'): void {
    const className = side === 'left' ? 'is-left-open' : 'is-right-open';
    const willOpen = !this.root.classList.contains(className);
    this.root.classList.remove('is-left-open', 'is-right-open');
    if (willOpen) this.root.classList.add(className);
    this.updateMobileAria();
  }

  private closeMobilePanels(): void {
    this.root.classList.remove('is-left-open', 'is-right-open');
    this.updateMobileAria();
  }

  private updateMobileAria(): void {
    this.mobileLeftButton.setAttribute('aria-expanded', String(this.root.classList.contains('is-left-open')));
    this.mobileRightButton.setAttribute('aria-expanded', String(this.root.classList.contains('is-right-open')));
  }
}
