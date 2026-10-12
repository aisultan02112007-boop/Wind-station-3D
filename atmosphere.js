import * as THREE from 'three';

// Возвращает координату в заданный диапазон даже после длинной паузы компьютера.
function wrapPosition(value, minimum, length) {
  return minimum + ((value - minimum) % length + length) % length;
}

// Генератор с фиксированным зерном: при перезагрузке ландшафт остаётся тем же.
function randomGenerator() {
  let seed = 27;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function createTerrain() {
  const geometry = new THREE.PlaneGeometry(1800, 1800, 96, 96);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    // Художественный рельеф. У фундамента ровная площадка; вдали степные гряды.
    const fade = Math.min(1, Math.max(0, (Math.hypot(x, z) - 65) / 160));
    const ridge = 65 * Math.exp(-Math.pow((z + 470) / 200, 2)) * (0.8 + 0.3 * Math.sin(x / 150));
    const height = fade * (12 + 14 * Math.sin(x / 160) * Math.cos(z / 180) + ridge);
    positions.setY(index, height);
    color.setHSL(0.20 + 0.018 * Math.sin(x / 90), 0.16, 0.09 + height / 1600);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const context = tile.getContext('2d');
  const random = randomGenerator();
  context.fillStyle = '#c0c0b6';
  context.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 9000; index++) {
    context.fillStyle = index % 2 ? '#929b82' : '#d3d2c0';
    context.fillRect(random() * 256, random() * 256, 1, 2);
  }
  const texture = new THREE.CanvasTexture(tile);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(48, 48);
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, map: texture, roughness: 1 }));
  ground.receiveShadow = true;
  return ground;
}

export function createAtmosphere() {
  const group = new THREE.Group();
  const random = randomGenerator();
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 256;
  cloudCanvas.height = 128;
  const context = cloudCanvas.getContext('2d');
  for (let index = 0; index < 7; index++) {
    const x = 45 + index * 25;
    const y = 65 + Math.sin(index * 2) * 10;
    const gradient = context.createRadialGradient(x, y, 1, x, y, 43);
    gradient.addColorStop(0, 'rgba(201,212,218,0.45)');
    gradient.addColorStop(1, 'rgba(201,212,218,0)');
    context.fillStyle = gradient;
    context.fillRect(x - 43, y - 43, 86, 86);
  }
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  const cloudMaterial = new THREE.SpriteMaterial({ map: cloudTexture, opacity: 0.5, depthWrite: false, fog: true });
  const clouds = [];
  for (let index = 0; index < 10; index++) {
    const cloud = new THREE.Sprite(cloudMaterial);
    cloud.position.set((random() - 0.5) * 1200, 170 + random() * 100, -650 + random() * 900);
    cloud.scale.set(170 + random() * 180, 55 + random() * 45, 1);
    clouds.push(cloud);
    group.add(cloud);
  }

  // Частицы обозначают направление потока. Это условные следы, а не измерение скорости воздуха.
  const trailPositions = new Float32Array(60 * 6);
  for (let index = 0; index < 60; index++) {
    const offset = index * 6;
    trailPositions[offset] = (random() - 0.5) * 250;
    trailPositions[offset + 1] = 8 + random() * 145;
    trailPositions[offset + 2] = (random() - 0.5) * 300;
    trailPositions[offset + 3] = trailPositions[offset];
    trailPositions[offset + 4] = trailPositions[offset + 1];
    trailPositions[offset + 5] = trailPositions[offset + 2] + 2;
  }
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  const trails = new THREE.LineSegments(trailGeometry, new THREE.LineBasicMaterial({ color: 0xbac9cf, transparent: true, opacity: 0.15, depthWrite: false }));
  trails.frustumCulled = false;
  group.add(trails);

  return {
    group,
    update(deltaTime, windSpeed) {
      trails.visible = windSpeed > 0;
      // Облака перемещаются условно медленнее ветра у ротора: графический эффект, не метеомодель.
      for (const cloud of clouds) {
        cloud.position.z = wrapPosition(cloud.position.z - windSpeed * 0.12 * deltaTime, -750, 1200);
      }
      // dz = -v*dt; v в m/s, dt в s, dz в m. Поток направлен от +Z к -Z.
      for (let index = 0; index < 60; index++) {
        const offset = index * 6;
        trailPositions[offset + 2] = wrapPosition(trailPositions[offset + 2] - windSpeed * deltaTime, -150, 300);
        trailPositions[offset + 5] = trailPositions[offset + 2] + 2;
      }
      trailGeometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      cloudTexture.dispose();
      cloudMaterial.dispose();
      trailGeometry.dispose();
      trails.material.dispose();
    }
  };
}
