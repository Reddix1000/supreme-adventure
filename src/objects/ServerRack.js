import * as THREE from 'three';

const CABINET_WIDTH = 0.6;
const CABINET_DEPTH = 0.8;
const CABINET_HEIGHT = 2.0;
const PANEL_INSET = 0.03;
const UNIT_COUNT = 4;

const LED_COLORS = {
  connected: 0x35d67e,
  connecting: 0xf5a623,
  error: 0xe0453c,
  offline: 0x8a8f98,
};

const DEFAULT_ADAPTER = { name: 'Unassigned', host: '-', port: '-', status: 'offline' };

/**
 * ServerRack - a self-contained, interactive low-poly server rack cabinet.
 *
 * new ServerRack({ camera, domElement, position })
 *   .setState({ adapters, activeIndex })
 *   .on('reconnect', cb)
 *   .on('adapterChange', cb)
 *   .update(delta)
 *   .dispose()
 */
export default class ServerRack {
  constructor({ camera, domElement, position = { x: 0, y: 0, z: 0 } } = {}) {
    if (!camera || !domElement) {
      throw new Error('ServerRack requires { camera, domElement }');
    }
    this.camera = camera;
    this.domElement = domElement;

    this.group = new THREE.Group();
    this.group.position.set(position.x || 0, position.y || 0, position.z || 0);

    this._listeners = { reconnect: new Set(), adapterChange: new Set(), build: new Set(), powerChange: new Set() };
    this._geometries = [];
    this._materials = [];
    this._textures = [];

    this.state = { adapters: [], activeIndex: 0 };
    this.gameplay = {
      isBuilt: true,
      powered: true,
      connectedToGrid: true,
      powerDrain: 8,
    };
    this.expanded = false;
    this.active = false;
    this._elapsed = 0;
    this._hovered = null;

    this._buildCabinet();
    this._buildRackUnits();
    this._buildDisplayPanel();

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onClick = this._handleClick.bind(this);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('click', this._onClick);

    this._redrawPanel();
  }

  // --- construction -------------------------------------------------------

  _buildCabinet() {
    const cabinetGeometry = new THREE.BoxGeometry(CABINET_WIDTH, CABINET_HEIGHT, CABINET_DEPTH);
    const cabinetMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b1d21,
      metalness: 0.6,
      roughness: 0.55,
    });
    this._geometries.push(cabinetGeometry);
    this._materials.push(cabinetMaterial);
    this.cabinetMesh = new THREE.Mesh(cabinetGeometry, cabinetMaterial);
    this.cabinetMesh.userData.rackPart = 'cabinet';
    this.group.add(this.cabinetMesh);

    const frontWidth = CABINET_WIDTH - PANEL_INSET * 2;
    const frontHeight = CABINET_HEIGHT - PANEL_INSET * 2;
    const frontGeometry = new THREE.BoxGeometry(frontWidth, frontHeight, 0.04);
    this.frontMaterial = new THREE.MeshStandardMaterial({
      color: 0x24262b,
      metalness: 0.4,
      roughness: 0.6,
      emissive: new THREE.Color(0x0a3d24),
      emissiveIntensity: 0.05,
    });
    this._geometries.push(frontGeometry);
    this._materials.push(this.frontMaterial);
    this.frontMesh = new THREE.Mesh(frontGeometry, this.frontMaterial);
    this.frontMesh.position.z = CABINET_DEPTH / 2 - PANEL_INSET;
    this.frontMesh.userData.rackPart = 'cabinet';
    this.group.add(this.frontMesh);
  }

  _buildRackUnits() {
    const unitWidth = CABINET_WIDTH - PANEL_INSET * 3;
    const unitHeight = 0.32;
    const unitDepth = 0.05;
    const unitGeometry = new THREE.BoxGeometry(unitWidth, unitHeight, unitDepth);
    const unitMaterial = new THREE.MeshStandardMaterial({
      color: 0x303338,
      metalness: 0.3,
      roughness: 0.7,
    });
    const ledGeometry = new THREE.BoxGeometry(0.035, 0.035, 0.02);
    this._geometries.push(unitGeometry, ledGeometry);
    this._materials.push(unitMaterial);

    this.units = [];
    const spacing = 0.4;
    const startY = ((UNIT_COUNT - 1) * spacing) / 2;
    for (let i = 0; i < UNIT_COUNT; i += 1) {
      const unitMesh = new THREE.Mesh(unitGeometry, unitMaterial);
      unitMesh.position.set(0, startY - i * spacing, CABINET_DEPTH / 2 - PANEL_INSET + unitDepth / 2);
      unitMesh.userData.rackPart = 'cabinet';
      this.group.add(unitMesh);

      const ledMaterial = new THREE.MeshStandardMaterial({
        color: LED_COLORS.offline,
        emissive: new THREE.Color(LED_COLORS.offline),
        emissiveIntensity: 0.8,
      });
      this._materials.push(ledMaterial);
      const ledMesh = new THREE.Mesh(ledGeometry, ledMaterial);
      ledMesh.position.set(unitWidth / 2 - 0.06, 0, unitDepth / 2 + 0.011);
      ledMesh.userData.rackPart = 'cabinet';
      unitMesh.add(ledMesh);

      this.units.push({ unitMesh, ledMesh, ledMaterial });
    }
  }

  _buildDisplayPanel() {
    this._canvas = document.createElement('canvas');
    this._canvas.width = 512;
    this._canvas.height = 640;
    this._ctx = this._canvas.getContext('2d');
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._textures.push(this._texture);

    const panelGeometry = new THREE.PlaneGeometry(0.42, 0.52);
    const panelMaterial = new THREE.MeshStandardMaterial({
      map: this._texture,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this._texture,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.1,
    });
    this._geometries.push(panelGeometry);
    this._materials.push(panelMaterial);

    this.panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
    this.panelMesh.position.set(0, 0.55, CABINET_DEPTH / 2 - PANEL_INSET + 0.03);
    this.panelMesh.userData.rackPart = 'panel';
    this.group.add(this.panelMesh);
    this._buttons = [];
  }

  // --- public API ---------------------------------------------------------

  setState(state = {}) {
    this.state = {
      adapters: state.adapters || this.state.adapters,
      activeIndex: state.activeIndex !== undefined ? state.activeIndex : this.state.activeIndex,
    };
    this._refreshRuntimeState();
    this._syncLeds();
    this._redrawPanel();
    return this;
  }

  setGameplayState(state = {}) {
    this.gameplay = {
      ...this.gameplay,
      ...state,
    };
    this._refreshRuntimeState();
    this._syncLeds();
    this._redrawPanel();
    return this;
  }

  on(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].add(callback);
    }
    return this;
  }

  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].delete(callback);
    }
    return this;
  }

  update(delta = 0) {
    this._elapsed += delta;
    this._refreshRuntimeState();
    const hoverBoost = this._hovered === 'cabinet' ? 0.35 : 0;
    const pulse = this.active ? 0.35 + Math.sin(this._elapsed * 3) * 0.25 : 0.05;
    this.frontMaterial.emissiveIntensity = Math.max(0, pulse + hoverBoost);
    this.panelMesh.material.emissiveIntensity = this.active ? 0.6 + Math.sin(this._elapsed * 3) * 0.2 : 0.35;
  }

  dispose() {
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('click', this._onClick);
    this._listeners.reconnect.clear();
    this._listeners.adapterChange.clear();
    this._listeners.build.clear();
    this._listeners.powerChange.clear();
    this._geometries.forEach((geometry) => geometry.dispose());
    this._materials.forEach((material) => material.dispose());
    this._textures.forEach((texture) => texture.dispose());
    this.group.parent?.remove(this.group);
    this._geometries.length = 0;
    this._materials.length = 0;
    this._textures.length = 0;
  }

  _refreshRuntimeState() {
    const active = this.state.adapters[this.state.activeIndex];
    const isConnected = this.gameplay.isBuilt && this.gameplay.powered && this.gameplay.connectedToGrid;
    this.active = Boolean(isConnected && active && active.status === 'connected');
    this.isOnline = isConnected;
  }

  // --- internals --------------------------------------------------------

  _syncLeds() {
    const isBuildReady = this.gameplay.isBuilt;
    const isPowered = this.gameplay.powered && this.gameplay.connectedToGrid;

    this.units.forEach(({ ledMaterial }, index) => {
      const adapter = this.state.adapters[index] || DEFAULT_ADAPTER;
      const effectiveStatus = !isBuildReady ? 'offline' : (!isPowered ? 'error' : adapter.status);
      const color = LED_COLORS[effectiveStatus] || LED_COLORS.offline;
      ledMaterial.color.setHex(color);
      ledMaterial.emissive.setHex(color);
    });
  }

  _formatUptime(seconds) {
    if (!seconds && seconds !== 0) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  _statusSummary(active) {
    if (!this.gameplay.isBuilt) return 'Unbuilt';
    if (!this.gameplay.powered || !this.gameplay.connectedToGrid) return 'No power';
    return active?.status || 'offline';
  }

  _slotLabel() {
    if (!this.gameplay.isBuilt) return 'Build rack';
    if (!this.gameplay.powered || !this.gameplay.connectedToGrid) return 'Connect power';
    return 'Reconnect';
  }

  _redrawPanel() {
    const ctx = this._ctx;
    const { width, height } = this._canvas;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#2a2f37';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, width - 6, height - 6);

    const adapters = this.state.adapters.length ? this.state.adapters : [DEFAULT_ADAPTER];
    const active = adapters[this.state.activeIndex] || adapters[0];

    if (!this.expanded) {
      this._drawCollapsed(ctx, width, height, active);
      this._buttons = [];
    } else {
      this._drawExpanded(ctx, width, height, adapters, active);
    }
    this._texture.needsUpdate = true;
  }

  _drawCollapsed(ctx, width, height, active) {
    ctx.fillStyle = this.gameplay.isBuilt && this.gameplay.powered ? '#7fe3a3' : '#f5a623';
    ctx.font = 'bold 42px monospace';
    ctx.fillText('RACK-01', 24, 60);
    ctx.font = '28px monospace';
    ctx.fillStyle = '#c9d1d9';
    ctx.fillText(active.name || DEFAULT_ADAPTER.name, 24, 120);
    ctx.fillStyle = '#8b949e';
    ctx.fillText(this._statusSummary(active), 24, 160);
    ctx.font = '20px monospace';
    ctx.fillStyle = '#586069';
    ctx.fillText(this.gameplay.isBuilt ? 'click for details' : 'build required', 24, height - 30);
  }

  _drawExpanded(ctx, width, height, adapters, active) {
    const title = this.gameplay.isBuilt ? 'Server Rack' : 'Blueprint Rack';
    ctx.fillStyle = this.gameplay.isBuilt && this.gameplay.powered ? '#7fe3a3' : '#f5a623';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(title, 24, 54);

    ctx.font = '24px monospace';
    ctx.fillStyle = '#c9d1d9';

    if (!this.gameplay.isBuilt) {
      const lines = [
        'Status: not built',
        'Power: offline',
        'Action: assemble rack to begin',
      ];
      lines.forEach((line, index) => {
        ctx.fillText(line, 24, 110 + index * 34);
      });
    } else {
      const lines = [
        `Adapter: ${active.name || DEFAULT_ADAPTER.name}`,
        `Host: ${active.host || '-'}:${active.port ?? '-'}`,
        `State: ${this._statusSummary(active)}`,
        `Uptime: ${this._formatUptime(active.uptime)}`,
      ];
      lines.forEach((line, index) => {
        ctx.fillText(line, 24, 100 + index * 34);
      });
    }

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#8b949e';
    ctx.fillText('LEDs', 24, 270);
    ctx.font = '20px monospace';
    adapters.slice(0, UNIT_COUNT).forEach((adapter, index) => {
      const y = 300 + index * 30;
      const effectiveStatus = !this.gameplay.isBuilt ? 'offline' : (!this.gameplay.powered || !this.gameplay.connectedToGrid ? 'error' : adapter.status);
      const color = LED_COLORS[effectiveStatus] || LED_COLORS.offline;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(34, y - 7, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9d1d9';
      ctx.fillText(adapter.name || DEFAULT_ADAPTER.name, 54, y);
    });

    this._buttons = [];
    const buttonHeight = 44;
    const buttonGap = 12;
    const buttonBottomPad = 20;
    const buttonY = height - (buttonHeight * 2 + buttonGap + buttonBottomPad);

    if (!this.gameplay.isBuilt) {
      this._drawButton(ctx, 'Build rack', 24, buttonY, width - 48, buttonHeight, 'build');
      return;
    }

    if (!this.gameplay.powered || !this.gameplay.connectedToGrid) {
      this._drawButton(ctx, 'Connect power', 24, buttonY, width - 48, buttonHeight, 'power');
      return;
    }

    this._drawButton(ctx, 'Reconnect', 24, buttonY, width - 48, buttonHeight, 'reconnect');
    this._drawButton(ctx, 'Switch adapter', 24, buttonY + buttonHeight + buttonGap, width - 48, buttonHeight, 'switch');
  }

  _drawButton(ctx, label, x, y, w, h, action) {
    const hovered = this._hoveredButton === action;
    ctx.fillStyle = hovered ? '#2ea043' : '#238636';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 8);
    ctx.textAlign = 'left';
    this._buttons.push({ action, x, y, w, h });
  }

  _pointerToNDC(event) {
    const rect = this.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _intersect(event) {
    this._pointerToNDC(event);
    this._raycaster.setFromCamera(this._pointer, this.camera);
    return this._raycaster.intersectObjects(this.group.children, true);
  }

  _buttonAtUV(uv) {
    if (!uv) return null;
    const x = uv.x * this._canvas.width;
    const y = (1 - uv.y) * this._canvas.height;
    return this._buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }

  _handlePointerMove(event) {
    const hits = this._intersect(event);
    const hit = hits[0];
    const part = hit?.object?.userData?.rackPart;

    if (part) {
      this.domElement.style.cursor = 'pointer';
    } else {
      this.domElement.style.cursor = 'auto';
    }

    if (part === 'panel' && this.expanded) {
      const button = this._buttonAtUV(hit.uv);
      const action = button?.action || null;
      if (action !== this._hoveredButton) {
        this._hoveredButton = action;
        this._redrawPanel();
      }
    } else if (this._hoveredButton) {
      this._hoveredButton = null;
      this._redrawPanel();
    }

    if (part !== this._hovered) {
      this._hovered = part || null;
    }
  }

  _handleClick(event) {
    const hits = this._intersect(event);
    const hit = hits[0];
    const part = hit?.object?.userData?.rackPart;

    if (!part) {
      if (this.expanded) {
        this.expanded = false;
        this._redrawPanel();
      }
      return;
    }

    if (part === 'panel') {
      if (!this.expanded) {
        this.expanded = true;
        this._redrawPanel();
        return;
      }
      const button = this._buttonAtUV(hit.uv);
      if (button?.action === 'build') {
        this.setGameplayState({ isBuilt: true, powered: false, connectedToGrid: false });
        this._emit('build', { rack: this });
      } else if (button?.action === 'power') {
        this.setGameplayState({ powered: true, connectedToGrid: true });
        this._emit('powerChange', { powered: true, connectedToGrid: true, rack: this });
      } else if (button?.action === 'reconnect') {
        this._emit('reconnect', { adapter: this.state.adapters[this.state.activeIndex] });
      } else if (button?.action === 'switch') {
        const count = this.state.adapters.length || 1;
        this.state.activeIndex = (this.state.activeIndex + 1) % count;
        this._emit('adapterChange', {
          index: this.state.activeIndex,
          adapter: this.state.adapters[this.state.activeIndex],
        });
        this.setState(this.state);
      }
      return;
    }

    // clicked cabinet body/unit
    if (!this.gameplay.isBuilt) {
      this.expanded = true;
      this._redrawPanel();
      return;
    }

    this.expanded = !this.expanded;
    this._redrawPanel();
  }

  _emit(event, payload) {
    this._listeners[event]?.forEach((callback) => callback(payload));
  }
}
