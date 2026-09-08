import * as THREE from 'three';
import ServerRack from '../objects/ServerRack.js';

const app = document.querySelector('#app');

const terminal = document.createElement('div');
terminal.className = 'terminal';
terminal.innerHTML = `
  <div class="terminal-header">
    <span class="terminal-title">rack-sys</span>
    <span class="terminal-prompt">root@node:~$</span>
  </div>
  <div class="terminal-body">
    <div class="terminal-line"><strong>status:</strong> <span id="terminal-status">offline</span></div>
    <div class="terminal-line"><strong>power:</strong> <span id="terminal-power">unpowered</span></div>
    <div class="terminal-line"><strong>grid:</strong> <span id="terminal-grid">disconnected</span></div>
    <div class="terminal-actions">
      <button class="terminal-button" data-action="build">build rack</button>
      <button class="terminal-button" data-action="power">power on</button>
      <button class="terminal-button" data-action="disconnect">disconnect</button>
      <button class="terminal-button" data-action="reconnect">reconnect</button>
    </div>
  </div>
`;
document.body.appendChild(terminal);

const statusEl = document.getElementById('terminal-status');
const powerEl = document.getElementById('terminal-power');
const gridEl = document.getElementById('terminal-grid');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11141a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.2, 1.6, 2.6);
camera.lookAt(0, 0.4, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const floorGeometry = new THREE.PlaneGeometry(8, 8);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9 });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.0;
scene.add(floor);

const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(3, 4, 2);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404050, 0.6));

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

rack.setGameplayState({
  isBuilt: true,
  powered: false,
  connectedToGrid: false,
  powerDrain: 8,
});

const updateTerminalLabels = () => {
  statusEl.textContent = rack.gameplay.isBuilt ? (rack.gameplay.powered && rack.gameplay.connectedToGrid ? 'online' : 'offline') : 'unbuilt';
  powerEl.textContent = rack.gameplay.powered ? 'powered' : 'unpowered';
  gridEl.textContent = rack.gameplay.connectedToGrid ? 'connected' : 'disconnected';
};

rack.on('build', () => {
  console.log('[ServerRack] built and ready for power');
  updateTerminalLabels();
});

rack.on('powerChange', ({ powered, connectedToGrid }) => {
  console.log('[ServerRack] power state changed:', powered, connectedToGrid);
  updateTerminalLabels();
});

rack.on('disconnect', ({ adapter, index }) => {
  console.log('[ServerRack] disconnected from grid:', index, adapter?.name);
  updateTerminalLabels();
});

rack.on('reconnect', ({ adapter }) => {
  console.log('[ServerRack] reconnect requested for', adapter?.name);
  updateTerminalLabels();
});

rack.on('adapterChange', ({ index, adapter }) => {
  console.log('[ServerRack] switched to adapter', index, adapter?.name);
});

updateTerminalLabels();

terminal.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  if (action === 'build') {
    rack.setGameplayState({ isBuilt: true, powered: false, connectedToGrid: false });
  }
  if (action === 'power') {
    rack.setGameplayState({ powered: true, connectedToGrid: true });
  }
  if (action === 'disconnect') {
    rack.disconnect();
  }
  if (action === 'reconnect') {
    rack.setGameplayState({ connectedToGrid: true });
  }
  updateTerminalLabels();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  const delta = clock.getDelta();
  rack.update(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('beforeunload', () => rack.dispose());
