# ServerRack

A self-contained, reusable three.js module that renders an interactive,
low-poly server rack cabinet — built for isometric/low-poly office scenes.
It uses only `BoxGeometry`, `PlaneGeometry` and `MeshStandardMaterial`, plus a
`CanvasTexture` for its front display panel. No external models or textures.

## Stack

- [Vite](https://vitejs.dev/) + vanilla JavaScript (ES modules)
- [three.js](https://threejs.org/) as the only runtime dependency

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL to see the demo scene: a rack on a plain floor
lit by a single directional light. Click the rack to open its info panel.

## Usage

```js
import * as THREE from 'three';
import ServerRack from './src/objects/ServerRack.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });

const rack = new ServerRack({
  camera,
  domElement: renderer.domElement,
  position: { x: 0, y: 0, z: 0 },
});
scene.add(rack.group);

rack.setState({
  adapters: [
    { name: 'eth0 - Primary Uplink', host: '10.0.1.10', port: 8443, status: 'connected', uptime: 51234 },
    { name: 'eth1 - Backup Link', host: '10.0.1.11', port: 8443, status: 'connecting', uptime: 120 },
    { name: 'wlan0 - Wireless', host: '10.0.2.5', port: 8080, status: 'error', uptime: 0 },
    { name: 'usb0 - Console', host: '-', port: '-', status: 'offline', uptime: 0 },
  ],
  activeIndex: 0,
});

rack.on('reconnect', ({ adapter }) => {
  // trigger your own reconnect logic here
});

rack.on('adapterChange', ({ index, adapter }) => {
  // update your app state here
});

function animate(delta) {
  rack.update(delta);
  renderer.render(scene, camera);
}

// when the rack is no longer needed:
rack.dispose();
```

## API

`new ServerRack({ camera, domElement, position })`

- `camera` — the `THREE.Camera` used for raycasting hover/click.
- `domElement` — the renderer's DOM element used for pointer events.
- `position` — optional `{ x, y, z }` placement of the rack's root group.

Methods:

- `.setState({ adapters, activeIndex })` — `adapters` is an array of up to
  four `{ name, host, port, status, uptime }` objects. `status` is one of
  `'connected' | 'connecting' | 'error' | 'offline'`, mapped to LED colours
  green / amber / red / grey.
- `.on(event, callback)` / `.off(event, callback)` — subscribe/unsubscribe
  to `'reconnect'` and `'adapterChange'` events. Both are emit-only; no
  network calls are made by the rack itself.
- `.update(delta)` — call every frame from your render loop to drive the
  emissive pulse animation while the active adapter is connected.
- `.dispose()` — removes all DOM listeners and disposes every geometry,
  material and texture created by the instance. Safe to call once the rack
  is no longer used.

## Behaviour

- Hovering the cabinet raises its emissive glow and switches the cursor to
  a pointer.
- Clicking the cabinet or its display expands the panel into a detailed
  view: active adapter name, host/port, connection state, uptime, and the
  four LEDs mapped to adapters.
- The expanded panel has two buttons: **Reconnect** and **Switch adapter**
  (cycles through the adapters list). Clicking outside the rack collapses
  the panel again.

## Project layout

```
index.html
src/
  objects/ServerRack.js   # the reusable module (default export)
  demo/main.js            # standalone demo scene
```
