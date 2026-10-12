import * as THREE from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { turbine } from './physics.js';

import { createTurbine } from './turbine-model.js';
import { createTerrain, createAtmosphere } from './atmosphere.js';

export function createWindScene(container, onUnavailable) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Трёхлопастная ветряная турбина на холмистой равнине. Обороты соответствуют расчёту рядом со сценой.');
  container.append(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x42515b);
  // Статическая воздушная перспектива; погода и смена суток будут отдельным этапом.
  scene.fog = new THREE.Fog(0x42515b, 350, 1200);
  scene.add(new THREE.HemisphereLight(0xa5c4d8, 0x262c25, 2));
  const sunlight = new THREE.DirectionalLight(0xdce4dd, 2.3);
  sunlight.position.set(-90, 160, 100);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, { left: -100, right: 100, top: 140, bottom: -100, near: 1, far: 450 });
  sunlight.shadow.normalBias = 0.12;
  scene.add(sunlight);
  scene.add(createTerrain());
  const { model, rotor, bladePivots } = createTurbine();
  scene.add(model);
  const atmosphere = createAtmosphere();
  scene.add(atmosphere.group);

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
  let windSpeed = 0;
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
      atmosphere.update(deltaTime, windSpeed);
    }
    previousTime = time;
    renderer.render(scene, camera);
    if (!paused && windSpeed > 0) requestDraw();
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
    setWind(speed, rotorSpeed) {
      // При старте не учитываем время стоянки; частые input не сбрасывают время анимации.
      if (windSpeed === 0) previousTime = null;
      windSpeed = speed;
      angularSpeed = rotorSpeed;
      // Флюгирование при cut-out: beta=90°=pi/2 rad, вокруг продольной оси каждой лопасти.
      // Это только визуальное положение: остановку определяет неизменённая physics.js.
      for (const pivot of bladePivots) pivot.rotation.y = speed >= turbine.cutOut ? Math.PI / 2 : 0;
      atmosphere.update(0, windSpeed);
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
      materials.forEach(material => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
      atmosphere.dispose();
      sunlight.shadow.dispose();
      renderer.dispose();
      canvas.remove();
    }
  };
}
