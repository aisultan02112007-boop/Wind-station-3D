import * as THREE from 'three';
import { turbine } from './physics.js';

// Скругляем углы стандартной коробки без дополнительных библиотек.
function roundedBox(width, height, length, radius) {
  const geometry = new THREE.BoxGeometry(width, height, length, 8, 8, 12);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    center.set(
      THREE.MathUtils.clamp(point.x, -width / 2 + radius, width / 2 - radius),
      THREE.MathUtils.clamp(point.y, -height / 2 + radius, height / 2 - radius),
      THREE.MathUtils.clamp(point.z, -length / 2 + radius, length / 2 - radius)
    );
    point.sub(center).normalize().multiplyScalar(radius).add(center);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createBladeGeometry(radius, rootRadius) {
  const spanSegments = 26;
  const profileSegments = 24;
  const vertices = [];
  const indices = [];
  for (let row = 0; row <= spanSegments; row++) {
    const fraction = row / spanSegments;
    const distance = rootRadius + fraction * (radius - rootRadius);
    // Художественные распределения хорды (m) и крутки (rad), не расчёт аэродинамических сил.
    const chord = row === spanSegments ? 0 : distance < 7
      ? 1.4 + (distance - rootRadius) / (7 - rootRadius) * 2.8
      : 4.2 * Math.pow((radius - distance) / (radius - 7), 0.75);
    const twist = 20 * Math.pow(1 - fraction, 1.8) * Math.PI / 180;
    const roundRoot = Math.max(0, 1 - fraction * 10);
    for (let column = 0; column <= profileSegments; column++) {
      const angle = column / profileSegments * 2 * Math.PI;
      const u = (1 - Math.cos(angle)) / 2;
      // NACA: yt/c = 5*t*(0.2969√u − 0.126u − 0.3516u² + 0.2843u³ − 0.1036u⁴).
      // t=0.18 и u безразмерны; после умножения на хорду c получаем толщину yt в m.
      const thickness = 5 * 0.18 * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1036 * u ** 4);
      const x = (u - 0.25 - roundRoot * 0.25) * chord;
      const z = chord * (Math.sign(Math.sin(angle)) * thickness * (1 - roundRoot) + Math.sin(angle) * 0.5 * roundRoot);
      // Поворот сечения вокруг продольной оси: x'=x*cos(a)+z*sin(a), z'=-x*sin(a)+z*cos(a); x,z в m, a в rad.
      vertices.push(x * Math.cos(twist) + z * Math.sin(twist), distance - rootRadius, -x * Math.sin(twist) + z * Math.cos(twist));
      if (row < spanSegments && column < profileSegments) {
        const start = row * (profileSegments + 1) + column;
        indices.push(start, start + 1, start + profileSegments + 1);
        indices.push(start + 1, start + profileSegments + 2, start + profileSegments + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Все размеры в метрах. Это условная турбина, а не модель конкретного производителя.
export function createTurbine() {
  const model = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xdfe4e3, metalness: 0.12, roughness: 0.48 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8b979d, metalness: 0.55, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x283239, roughness: 0.7 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x737875, roughness: 1 });

  function addPart(parent, name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  addPart(model, 'foundation', new THREE.CylinderGeometry(6.5, 7.5, 0.8, 12), concrete, 0, 0.4, 0);
  addPart(model, 'base-flange', new THREE.CylinderGeometry(3.55, 3.55, 0.35, 48), metal, 0, 0.95, 0);
  addPart(model, 'tower', new THREE.CylinderGeometry(1.7, 3.2, turbine.hubHeight, 48), white, 0, turbine.hubHeight / 2, 0);
  for (let index = 0; index < 16; index++) {
    const angle = index * Math.PI * 2 / 16;
    addPart(model, 'foundation-bolt', new THREE.CylinderGeometry(0.085, 0.085, 0.18, 6), dark, 3.35 * Math.cos(angle), 1.2, 3.35 * Math.sin(angle));
  }
  for (const height of [26, 52]) {
    const radius = 3.2 - height / turbine.hubHeight * 1.5;
    addPart(model, 'tower-seam', new THREE.CylinderGeometry(radius + 0.015, radius + 0.015, 0.12, 48), metal, 0, height, 0);
  }
  addPart(model, 'door', roundedBox(1.4, 2.5, 0.2, 0.09), dark, 0, 2.5, 3.12);
  for (let index = 0; index < 3; index++) {
    addPart(model, 'step', new THREE.BoxGeometry(1.7, 0.2 + index * 0.2, 0.65), metal, 0, 0.9 + index * 0.1, 5.15 - index * 0.65);
  }

  // Отдельная группа позволяет позже поворачивать всю гондолу по направлению ветра (yaw).
  const yaw = new THREE.Group();
  yaw.name = 'yaw';
  yaw.position.y = turbine.hubHeight;
  model.add(yaw);
  addPart(yaw, 'yaw-bearing', new THREE.CylinderGeometry(2, 2, 0.6, 32), metal, 0, -2.3, 0);
  addPart(yaw, 'nacelle', roundedBox(5.8, 5.6, 12, 1), white, 0, 0, -1.8);
  addPart(yaw, 'service-hatch', roundedBox(2.4, 0.24, 3.2, 0.1), metal, 0, 2.83, -2.5);
  for (let index = 0; index < 6; index++) {
    addPart(yaw, 'vent', new THREE.BoxGeometry(3, 0.15, 0.05), dark, 0, -0.9 + index * 0.36, -7.81);
  }
  const shaft = addPart(yaw, 'main-shaft', new THREE.CylinderGeometry(1.25, 1.25, 3, 32), metal, 0, 0, 5.2);
  shaft.rotation.x = Math.PI / 2;

  addPart(yaw, 'sensor-mast', new THREE.CylinderGeometry(0.07, 0.07, 2, 8), metal, 0.7, 3.85, -4.5);
  for (let index = 0; index < 3; index++) {
    const angle = index * 2 * Math.PI / 3;
    const arm = addPart(yaw, 'anemometer-arm', new THREE.BoxGeometry(0.7, 0.05, 0.05), metal, 0.7 + 0.3 * Math.cos(angle), 4.85, -4.5 + 0.3 * Math.sin(angle));
    arm.rotation.y = -angle;
    addPart(yaw, 'anemometer-cup', new THREE.SphereGeometry(0.15, 10, 8), dark, 0.7 + 0.65 * Math.cos(angle), 4.85, -4.5 + 0.65 * Math.sin(angle));
  }
  addPart(yaw, 'vane-mast', new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), metal, -0.7, 3.65, -4.5);
  addPart(yaw, 'wind-vane', new THREE.BoxGeometry(0.06, 0.35, 0.8), dark, -0.7, 4.45, -4.7);

  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.z = 6.5;
  yaw.add(rotor);
  const spinnerProfile = [new THREE.Vector2(2.4, -0.4), new THREE.Vector2(2.8, 0.6), new THREE.Vector2(2.5, 2.4), new THREE.Vector2(1.3, 4), new THREE.Vector2(0, 4.8)];
  const spinner = addPart(rotor, 'spinner', new THREE.LatheGeometry(spinnerProfile, 40), white, 0, 0, 0);
  spinner.rotation.x = Math.PI / 2;

  const rootRadius = 2.4;
  const bladeGeometry = createBladeGeometry(turbine.radius, rootRadius);
  const bladePivots = [];
  for (let index = 0; index < 3; index++) {
    const arm = new THREE.Group();
    // Три лопасти: theta = index * 2*pi/3, угол в rad.
    arm.rotation.z = index * 2 * Math.PI / 3;
    rotor.add(arm);
    const collar = addPart(arm, 'pitch-bearing', new THREE.CylinderGeometry(0.8, 0.8, 1, 24), metal, 0, rootRadius, 0);
    collar.receiveShadow = false;
    const pivot = new THREE.Group();
    pivot.name = 'blade-pitch';
    pivot.position.y = rootRadius;
    arm.add(pivot);
    addPart(pivot, 'blade', bladeGeometry, white, 0, 0, 0);
    bladePivots.push(pivot);
  }
  return { model, rotor, yaw, bladePivots };
}
