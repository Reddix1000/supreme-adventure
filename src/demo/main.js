import * as THREE from 'three';
import ServerRack from '../objects/ServerRack.js';

const app = document.querySelector('#app');

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

rack.on('reconnect', ({ adapter }) => {
  console.log('[ServerRack] reconnect requested for', adapter?.name);
});

rack.on('adapterChange', ({ index, adapter }) => {
  console.log('[ServerRack] switched to adapter', index, adapter?.name);
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
