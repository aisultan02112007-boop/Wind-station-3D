import * as THREE from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { turbine } from './physics.js';

// Масштаб сцены: одна единица Three.js равна одному метру.
export function createTurbine() {
  const model = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eeed, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x29454d, roughness: 0.8 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x93988b, roughness: 1 });

  function addPart(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
    return mesh;
  }

  addPart(new THREE.CylinderGeometry(6, 7, 0.8, 32), concrete, 0, 0.4, 0);
  addPart(new THREE.CylinderGeometry(1.7, 3.2, turbine.hubHeight, 32), white, 0, turbine.hubHeight / 2, 0);
  addPart(new THREE.BoxGeometry(1.6, 3, 0.3), dark, 0, 2.3, 3.05);
  addPart(new THREE.BoxGeometry(5.8, 5, 11), white, 0, turbine.hubHeight, -1);
  addPart(new THREE.BoxGeometry(5.9, 0.6, 6), dark, 0, turbine.hubHeight + 1, -2);

  const rotor = new THREE.Group();
  rotor.position.set(0, turbine.hubHeight, 6.5);
  model.add(rotor);

  const hub = new THREE.Mesh(new THREE.ConeGeometry(2.7, 5, 32), white);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 2;
  hub.castShadow = true;
  rotor.add(hub);

  // Условный профиль лопасти. Кончик расположен в r=40 m от оси, как в physics.js.
  const radius = turbine.radius;
  const shape = new THREE.Shape();
  shape.moveTo(-0.8, 1.7);
  shape.quadraticCurveTo(-3, 8, -2.1, 16);
  shape.quadraticCurveTo(-1, radius * 0.8, 0, radius);
  shape.quadraticCurveTo(1.1, radius * 0.7, 2, 12);
  shape.quadraticCurveTo(2.7, 5, 0.8, 1.7);
  shape.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.45, bevelEnabled: false, steps: 1, curveSegments: 12
  });
  for (let index = 0; index < 3; index++) {
    const blade = new THREE.Mesh(bladeGeometry, white);
    // Три лопасти равномерно по окружности: theta = index * 2*pi/3, угол в rad.
    blade.rotation.z = index * 2 * Math.PI / 3;
    blade.castShadow = true;
    blade.receiveShadow = true;
    rotor.add(blade);
  }
  return { model, rotor };
}

function createTerrain() {
  const geometry = new THREE.PlaneGeometry(1800, 1800, 80, 80);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const green = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    // Художественный рельеф; рядом с фундаментом оставляем ровную площадку.
    const fade = Math.min(1, Math.max(0, (Math.hypot(x, z) - 85) / 150));
    const ridge = 65 * Math.exp(-Math.pow((z + 470) / 200, 2)) * (0.8 + 0.3 * Math.sin(x / 150));
    const height = fade * (12 + 14 * Math.sin(x / 160) * Math.cos(z / 180) + ridge);
    positions.setY(index, height);
    green.setHSL(0.22 + 0.015 * Math.sin(x / 90), 0.32, 0.11 + height / 1100);
    colors.push(green.r, green.g, green.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  return ground;
}

export function createWindScene(container, onUnavailable) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Трёхлопастная ветряная турбина на холмистой равнине. Обороты соответствуют расчёту рядом со сценой.');
  container.append(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb3c8cf);
  // Статическая воздушная перспектива; погода и смена суток будут отдельным этапом.
  scene.fog = new THREE.Fog(0xb3c8cf, 350, 1200);
  scene.add(new THREE.HemisphereLight(0xcceaff, 0x5e6649, 1.6));
  const sunlight = new THREE.DirectionalLight(0xffe2bc, 2.4);
  sunlight.position.set(-90, 160, 100);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, { left: -100, right: 100, top: 140, bottom: -100, near: 1, far: 450 });
  sunlight.shadow.normalBias = 0.12;
  scene.add(sunlight);
  scene.add(createTerrain());
  const { model, rotor } = createTurbine();
  scene.add(model);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.5, 2000);
  camera.position.set(95, 82, 180);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 56, 0);
  controls.enablePan = false;
  controls.minDistance = 115;
  controls.maxDistance = 380;
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();
  controls.saveState();

  let angularSpeed = 0;
  let paused = false;
  let previousTime = null;
  let frameId = null;
  let unavailable = false;

  function requestDraw() {
    if (frameId === null && !document.hidden && !unavailable) frameId = requestAnimationFrame(drawFrame);
  }

  function drawFrame(time) {
    frameId = null;
    if (unavailable || document.hidden) return;
    if (previousTime !== null && !paused) {
      // dt = (t - t_previous)/1000; метки RAF в ms, dt в s.
      const deltaTime = (time - previousTime) / 1000;
      // theta_new = theta + omega*dt; omega в rad/s, dt в s, theta в rad.
      rotor.rotation.z = (rotor.rotation.z + angularSpeed * deltaTime) % (2 * Math.PI);
    }
    previousTime = time;
    renderer.render(scene, camera);
    if (!paused && angularSpeed > 0) requestDraw();
  }

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    requestDraw();
  }

  function visibilityChanged() {
    previousTime = null;
    if (document.hidden && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    requestDraw();
  }

  function contextLost(event) {
    event.preventDefault();
    unavailable = true;
    if (frameId !== null) cancelAnimationFrame(frameId);
    onUnavailable();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  controls.addEventListener('change', requestDraw);
  document.addEventListener('visibilitychange', visibilityChanged);
  canvas.addEventListener('webglcontextlost', contextLost);
  resize();

  return {
    setAngularSpeed(value) {
      // При старте не учитываем время стоянки; при смене ненулевой скорости сохраняем ход времени.
      if (angularSpeed === 0) previousTime = null;
      angularSpeed = value;
      requestDraw();
    },
    setPaused(value) {
      paused = value;
      previousTime = null;
      requestDraw();
    },
    moveCamera(action) {
      if (action === 'reset') {
        controls.reset();
      } else {
        camera.position.sub(controls.target);
        if (action === 'left' || action === 'right') {
          camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? -0.25 : 0.25);
        } else {
          camera.position.multiplyScalar(action === 'in' ? 0.85 : 1.15);
          camera.position.clampLength(controls.minDistance, controls.maxDistance);
        }
        camera.position.add(controls.target);
        controls.update();
      }
      requestDraw();
    },
    dispose() {
      unavailable = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('webglcontextlost', contextLost);
      controls.dispose();
      // Общие геометрии и материалы освобождаем один раз.
      const geometries = new Set();
      const materials = new Set();
      scene.traverse(object => {
        if (object.isMesh) {
          geometries.add(object.geometry);
          materials.add(object.material);
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      sunlight.shadow.dispose();
      renderer.dispose();
      canvas.remove();
    }
  };
}
