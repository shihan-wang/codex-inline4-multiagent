import './style.css';

import { EngineApp } from './app';
import { getCylinderStates } from './engine/kinematics';
import { EngineSimulation } from './engine/simulation';
import { createEngineScene } from './scene';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing required #app mount element.');

const viewport = document.createElement('div');
viewport.className = 'scene-viewport';
viewport.setAttribute('role', 'region');
viewport.setAttribute('aria-label', '柴油机三维视图');
Object.assign(viewport.style, {
  position: 'absolute',
  inset: '0',
  overflow: 'hidden',
});
root.append(viewport);

const app = new EngineApp({
  root,
  viewport,
  scene: createEngineScene(),
  simulation: new EngineSimulation(getCylinderStates),
});

app.start();
window.addEventListener('pagehide', () => app.dispose(), { once: true });
