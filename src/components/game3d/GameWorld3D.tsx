import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cameraState } from "../world/cameraState";
import { VENDORS } from "@/lib/shop";
import type { AvatarConfig } from "@/lib/avatar";

/**
 * Pure Three.js 3D game world — no R3F.
 *
 * Coordinate: SVG (x, y) → Three.js (x, 0, -y)
 * Camera: orthographic, top-down, follows player.
 */

// ── Types ──
interface PlayerState {
  x: number; y: number; facing: number; moving: boolean;
  config: AvatarConfig; name?: string; bubble?: string | null;
}
interface RemotePlayer {
  sessionId: string; x: number; y: number; facing: number;
  config: AvatarConfig; name: string; bubble?: string | null;
}
interface Props {
  player: PlayerState;
  remotePlayers: RemotePlayer[];
  onPlayerClick?: () => void;
  onRemoteClick?: (sessionId: string) => void;
}

// ── Constants ──
const WORLD_W = 1600;
const WORLD_H = 900;

// ══════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ══════════════════════════════════════════════════════

/** SVG (x, svgY) → Three.js (x, height, -svgY) */
function w3(x: number, svgY: number, h = 0): [number, number, number] {
  return [x, h, -svgY];
}

function mat(color: string, opts?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, ...opts });
}

function plane(w: number, h: number, color: string, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

function box(w: number, h: number, d: number, color: string): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

// ══════════════════════════════════════════════════════
//  BUILD WORLD
// ══════════════════════════════════════════════════════

function buildWorld(scene: THREE.Scene) {
  // ── GROUND ──
  const grass = plane(WORLD_W, WORLD_H, "#5a9a4a", -0.1);
  grass.position.set(WORLD_W / 2, 0, -WORLD_H / 2);
  scene.add(grass);

  // ── ZONE FOUNDATIONS ──
  const zones: [number, number, number, number, string][] = [
    [360, -245, 720, 490, "#c4b8a4"],   // shops
    [1240, -245, 720, 490, "#4a8a3a"],  // park
    [360, -825, 720, 150, "#c0b4a0"],   // houses
    [1240, -825, 720, 150, "#b8b0a0"],  // arena
    [320, -620, 640, 260, "#c4b8a4"],   // left strip
    [1280, -620, 640, 260, "#4a8a3a"],  // right strip
    [800, -825, 320, 150, "#c0b4a0"],   // bottom vert
    [800, -245, 320, 490, "#c4b8a4"],   // top vert
  ];
  zones.forEach(([cx, cz, w, h, c]) => {
    const m = plane(w, h, c, -0.05);
    m.position.set(cx, 0, cz);
    scene.add(m);
  });

  // ── SIDEWALKS ──
  [[WORLD_W / 2, -525, WORLD_W, 70], [WORLD_W / 2, -715, WORLD_W, 70]].forEach(([cx, cz, w, h]) => {
    const m = plane(w, h, "#c8c0b0", 0.001);
    m.position.set(cx, 0, cz);
    scene.add(m);
  });

  // Sidewalk tile lines
  [510, 530, 550, 700, 720, 740].forEach(svgY => {
    const m = plane(WORLD_W, 0.8, "#bbb4a4", 0.002);
    m.position.set(WORLD_W / 2, 0, -svgY);
    (m.material as THREE.MeshStandardMaterial).transparent = true;
    (m.material as THREE.MeshStandardMaterial).opacity = 0.35;
    scene.add(m);
  });

  // ── HORIZONTAL ROAD (y=560..680) ──
  const roadMat = mat("#3a3a3c", { roughness: 0.9 });
  [[320, -620, 640, 120], [1280, -620, 640, 120]].forEach(([cx, cz, w, h]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), roadMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.005, cz);
    scene.add(m);
  });

  // Curbs
  ([562, 678] as const).forEach(svgY => {
    const m = box(WORLD_W, 0.06, 4, "#7a7570");
    m.position.set(WORLD_W / 2, 0.02, -svgY);
    scene.add(m);
  });

  // Edge lines
  const lineMat = new THREE.MeshBasicMaterial({ color: "#e8e4e0" });
  [565, 675].forEach(svgY => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, 3), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(WORLD_W / 2, 0.02, -svgY);
    scene.add(m);
  });

  // Yellow center lines
  const yellowMat = new THREE.MeshBasicMaterial({ color: "#e8c84a" });
  [618, 622].forEach(svgY => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, 2), yellowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(WORLD_W / 2, 0.02, -svgY);
    scene.add(m);
  });

  // Dashed white lines
  for (let i = 0; i < 22; i++) {
    const x = i * 80 - WORLD_W / 2 + 40;
    if (x > -100 && x < 100) continue;
    [-12, 12].forEach(offset => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(45, 2.5), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, -620 + offset);
      scene.add(m);
    });
  }

  // ── VERTICAL ROAD (x=720..880) ──
  [[800, -245, 160, 490], [800, -825, 160, 150]].forEach(([cx, cz, w, h]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), roadMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.005, cz);
    scene.add(m);
  });

  // Vertical curbs
  [722, 878].forEach(svgX => {
    const m = box(4, 0.06, WORLD_H, "#7a7570");
    m.position.set(-svgX, 0.02, -WORLD_H / 2);
    scene.add(m);
  });

  // Vertical edge lines
  [725, 875].forEach(svgX => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, WORLD_H), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(-svgX, 0.02, -WORLD_H / 2);
    scene.add(m);
  });

  // Vertical yellow lines
  [798, 802].forEach(svgX => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, WORLD_H), yellowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(-svgX, 0.02, -WORLD_H / 2);
    scene.add(m);
  });

  // Vertical dashed lines
  for (let i = 0; i < 12; i++) {
    const z = -(100 + i * 70);
    if (z > -700 && z < -540) continue;
    [-8, 8].forEach(offset => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 45), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(800 + offset, 0.02, z);
      scene.add(m);
    });
  }

  // ── CENTRAL PLAZA ──
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(140, 32), mat("#b0a890"));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(800, 0.01, -620);
  scene.add(plaza);

  const ring1 = new THREE.Mesh(new THREE.RingGeometry(90, 100, 32), mat("#a09880"));
  ring1.rotation.x = -Math.PI / 2;
  ring1.position.set(800, 0.015, -620);
  scene.add(ring1);

  const ring2 = new THREE.Mesh(new THREE.RingGeometry(130, 140, 32), mat("#908870"));
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.set(800, 0.012, -620);
  scene.add(ring2);

  // Plaza radiating lines
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 130), new THREE.MeshBasicMaterial({ color: "#908870", transparent: true, opacity: 0.3 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = angle;
    m.position.set(800, 0.018, -620);
    scene.add(m);
  }

  // ── PARK GRASS ──
  const parkGrass = plane(640, 450, "#5a9a4a", -0.03);
  parkGrass.position.set(1240, 0, -245);
  scene.add(parkGrass);

  // ── BUILDINGS ──
  const buildings: { x: number; y: number; w: number; d: number; ht: number; c: string; sc: string; fl: number }[] = [
    // SHOPS (top-left, facing south)
    { x: 30, y: 120, w: 155, d: 340, ht: 120, c: "#e8a87c", sc: "#c87848", fl: 3 },
    { x: 205, y: 120, w: 120, d: 340, ht: 200, c: "#e8ecf0", sc: "#c0c4cc", fl: 5 },
    { x: 345, y: 120, w: 150, d: 340, ht: 150, c: "#f0d8b8", sc: "#d4b088", fl: 3 },
    { x: 515, y: 120, w: 155, d: 340, ht: 130, c: "#e8b088", sc: "#c88858", fl: 3 },
    // Shops along vertical road left
    { x: 30, y: 25, w: 135, d: 65, ht: 140, c: "#d49060", sc: "#b06838", fl: 4 },
    { x: 185, y: 25, w: 125, d: 60, ht: 110, c: "#e0e4ec", sc: "#b8bcc8", fl: 3 },
    { x: 330, y: 25, w: 145, d: 65, ht: 160, c: "#e4a0b0", sc: "#c87898", fl: 4 },
    { x: 495, y: 25, w: 120, d: 60, ht: 100, c: "#f0e8d0", sc: "#d8d0b8", fl: 2 },
    // HOUSES (bottom-left)
    { x: 30, y: 775, w: 115, d: 95, ht: 80, c: "#f0d0a8", sc: "#d4b080", fl: 2 },
    { x: 165, y: 775, w: 100, d: 95, ht: 70, c: "#e8c8a0", sc: "#c8a878", fl: 2 },
    { x: 285, y: 775, w: 125, d: 95, ht: 90, c: "#f8e0c0", sc: "#dcc098", fl: 2 },
    { x: 430, y: 775, w: 105, d: 95, ht: 75, c: "#e0c090", sc: "#c4a068", fl: 2 },
    { x: 555, y: 775, w: 115, d: 95, ht: 85, c: "#f0d8b8", sc: "#d4b888", fl: 2 },
    // ARENA (bottom-right)
    { x: 920, y: 775, w: 190, d: 95, ht: 110, c: "#b04040", sc: "#903030", fl: 3 },
    { x: 1130, y: 775, w: 125, d: 95, ht: 90, c: "#906040", sc: "#704828", fl: 2 },
    { x: 1275, y: 775, w: 135, d: 95, ht: 80, c: "#a08060", sc: "#806040", fl: 2 },
    { x: 1430, y: 775, w: 115, d: 95, ht: 95, c: "#8890a0", sc: "#687080", fl: 2 },
  ];

  const winColor = "#6ab0d6";

  buildings.forEach(b => {
    const cx = b.x + b.w / 2;
    const baseZ = -b.y;

    // Front face
    const front = box(b.w, b.ht, 2, b.c);
    front.position.set(cx, b.ht / 2, baseZ);
    scene.add(front);

    // Side face
    const side = box(20, b.ht, b.d, b.sc);
    side.position.set(b.x + b.w + 10, b.ht / 2, baseZ - b.d / 2);
    scene.add(side);

    // Roof
    const roof = box(b.w + 4, 3, b.d + 4, "#505058");
    roof.position.set(cx, b.ht + 1.5, baseZ - b.d / 2);
    scene.add(roof);

    // Windows
    const storyH = b.ht / b.fl;
    const winsPerFloor = Math.max(1, Math.floor(b.w / 55));
    const winSpacing = b.w / (winsPerFloor + 1);
    for (let f = 0; f < b.fl; f++) {
      for (let wi = 0; wi < winsPerFloor; wi++) {
        const win = box(Math.min(24, b.w / 6), Math.min(26, storyH - 16), 1, winColor);
        win.position.set(b.x + winSpacing * (wi + 1), storyH * 0.45 + f * storyH + b.ht * 0.05, baseZ - 1.5);
        scene.add(win);
      }
    }
  });

  // Background buildings (behind shops, semi-transparent)
  const bgBuildings = [
    { x: -10, y: -80, w: 70, ht: 180 }, { x: 80, y: -90, w: 55, ht: 220 },
    { x: 200, y: -70, w: 60, ht: 160 }, { x: 320, y: -85, w: 50, ht: 200 },
    { x: 440, y: -75, w: 65, ht: 190 }, { x: 560, y: -90, w: 55, ht: 170 },
  ];
  const bgColors = ["#b0b8c4", "#a8b0bc", "#bcc4d0", "#a0a8b4", "#b4bcc8", "#b0b8c4"];

  bgBuildings.forEach((b, i) => {
    const cx = b.x + b.w / 2;
    const baseZ = -(b.y + 40);
    const bg = box(b.w, b.ht, 25, bgColors[i]);
    bg.position.set(cx, b.ht / 2, baseZ);
    (bg.material as THREE.MeshStandardMaterial).transparent = true;
    (bg.material as THREE.MeshStandardMaterial).opacity = 0.4;
    scene.add(bg);
  });

  // ── TREES (park area) ──
  const treePositions = [
    [980, 130], [1100, 90], [1240, 170], [1380, 110], [1500, 150],
    [1040, 270], [1180, 310], [1320, 350], [1460, 290],
    [1120, 430], [1300, 440], [1450, 410],
  ];

  const leafPalettes = [
    ["#2d9a3a", "#3aad48", "#44b852", "#5ed06a", "#80e878", "#38a845"],
    ["#1a8a6a", "#22a07a", "#28a880", "#38c090", "#50d8a0", "#209a75"],
    ["#4a9a30", "#55a838", "#5cb840", "#6cc850", "#88e068", "#50a535"],
  ];

  treePositions.forEach(([tx, ty], i) => {
    const [wx, , wz] = w3(tx, ty);

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 4, 22, 8),
      mat("#b87a3d")
    );
    trunk.position.set(wx, 11, wz);
    scene.add(trunk);

    // Leaf clusters
    const palette = leafPalettes[i % 3];
    const clusters: [number, number, number, number][] = [
      [0, 30, 0, 12], [-10, 24, 5, 9], [10, 26, -4, 8],
      [0, 36, 0, 10], [-6, 38, 3, 7], [6, 37, -2, 7],
      [0, 42, 0, 6], [12, 22, 6, 7], [-12, 28, -5, 8],
    ];

    clusters.forEach(([dx, dy, dz, r], j) => {
      const leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 1),
        mat(palette[j % palette.length])
      );
      leaf.position.set(wx + dx, dy, wz + dz);
      scene.add(leaf);
    });
  });

  // ── VENDOR STALLS ──
  VENDORS.forEach(v => {
    const [wx, , wz] = w3(v.x, v.y);

    // Table
    const table = box(70, 6, 28, "#5b4636");
    table.position.set(wx, 22, wz);
    scene.add(table);

    const tableTop = box(64, 3, 24, "#7a5c3f");
    tableTop.position.set(wx, 26, wz);
    scene.add(tableTop);

    // Awning poles
    [-32, 32].forEach(px => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 30, 6), mat("#6b4a2f"));
      pole.position.set(wx + px, 40, wz);
      scene.add(pole);
    });

    // Awning
    const awning = box(78, 2.5, 32, v.color);
    awning.position.set(wx, 55, wz);
    scene.add(awning);
  });

  // ── LAMP POSTS ──
  [[700, 500], [900, 500], [700, 740], [900, 740], [500, 500], [1100, 500]].forEach(([lx, ly]) => {
    const [wx, , wz] = w3(lx, ly);
    const base = box(6, 4, 6, "#4a4540");
    base.position.set(wx, 2, wz);
    scene.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.5, 40, 6), mat("#5a5550"));
    pole.position.set(wx, 22, wz);
    scene.add(pole);
    const head = box(8, 5, 8, "#6a6560");
    head.position.set(wx, 44, wz);
    scene.add(head);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(3, 8, 8),
      new THREE.MeshStandardMaterial({ color: "#ffd166", emissive: "#ffd166", emissiveIntensity: 0.5 })
    );
    bulb.position.set(wx, 41, wz);
    scene.add(bulb);
  });

  // ── HEDGES (north sidewalk) ──
  [100, 250, 400, 550].forEach(hx => {
    const [wx, , wz] = w3(hx, 530);
    const h = box(50, 12, 12, "#2d7a38");
    h.position.set(wx, 6, wz);
    scene.add(h);
  });

  // ── FOUNTAIN ──
  const [fx, , fz] = w3(800, 620);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(18, 20, 8, 16), mat("#8090a0"));
  pool.position.set(fx, 4, fz);
  scene.add(pool);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 2, 16),
    new THREE.MeshStandardMaterial({ color: "#4a90d0", transparent: true, opacity: 0.6 })
  );
  water.position.set(fx, 7, fz);
  scene.add(water);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 20, 8), mat("#a0a0a0"));
  pillar.position.set(fx, 18, fz);
  scene.add(pillar);

  // ── MAP BORDER HEDGES ──
  [100, 250, 400, 550, 700].forEach(by => {
    [15, 1585].forEach(bx => {
      const [wx, , wz] = w3(bx, by);
      const h = box(20, 10, 50, "#2d7a38");
      h.position.set(wx, 5, wz);
      scene.add(h);
    });
  });

  // ── FLOWER BOXES ──
  [180, 420, 660, 1080, 1380].forEach(fx => {
    const [wx, , wz] = w3(fx, 800);
    const boxMesh = box(14, 6, 8, "#7a5a30");
    boxMesh.position.set(wx, 3, wz);
    scene.add(boxMesh);
    ["#ff6b6b", "#ffd166", "#ff6bcb"].forEach((fc, j) => {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(2.5, 6, 6), mat(fc));
      flower.position.set(wx + (j - 1) * 4, 8, wz);
      scene.add(flower);
    });
  });

  // ── BENCHES ──
  [[350, 810], [1150, 810]].forEach(([bx, by]) => {
    const [wx, , wz] = w3(bx, by);
    const seat = box(24, 3, 8, "#7a5a30");
    seat.position.set(wx, 8, wz);
    scene.add(seat);
    const back = box(24, 8, 2.5, "#7a5a30");
    back.position.set(wx, 14, wz - 3.5);
    scene.add(back);
  });

  // ── BOTTOM GRASS ──
  const bottomGrass = plane(WORLD_W, 40, "#4a8a3a", -0.03);
  bottomGrass.position.set(WORLD_W / 2, 0, -880);
  scene.add(bottomGrass);
}

// ══════════════════════════════════════════════════════
//  AVATAR BUILDER
// ══════════════════════════════════════════════════════

function buildAvatar(group: THREE.Group, config: AvatarConfig) {
  const skin = config.skin || "#f0b888";
  const shirt = config.shirt || "#4488cc";
  const pants = config.pants || "#334455";
  const shoes = config.shoes || "#444444";
  const hair = config.hairColor || "#332211";

  // Body
  const body = box(14, 16, 10, shirt);
  body.position.y = 20;
  body.name = "body";
  group.add(body);

  // Head
  const head = box(12, 12, 11, skin);
  head.position.y = 34;
  head.name = "head";
  group.add(head);

  // Hair
  const hairMesh = box(14, 5, 13, hair);
  hairMesh.position.y = 40;
  group.add(hairMesh);

  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#1a1a2e" });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 1.5), eyeMat);
  eyeL.position.set(-3, 35, 5.5);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 1.5), eyeMat);
  eyeR.position.set(3, 35, 5.5);
  group.add(eyeR);

  // Arms
  const armMat = mat(skin);
  [-9, 9].forEach(x => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 5), armMat);
    arm.position.set(x, 22, 0);
    group.add(arm);
  });

  // Legs
  const legMat = mat(pants);
  [-4, 4].forEach(x => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 6), legMat);
    leg.position.set(x, 8, 0);
    group.add(leg);
  });

  // Shoes
  const shoeMat = mat(shoes);
  [-4, 4].forEach(x => {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 8), shoeMat);
    shoe.position.set(x, 2, 1.5);
    group.add(shoe);
  });

  // Shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(8, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.3;
  shadow.name = "shadow";
  group.add(shadow);

  // Name tag sprite (always faces camera)
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#28c840";
  ctx.roundRect(0, 0, 256, 64, 12);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const tex = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(40, 10, 1);
  sprite.position.y = 52;
  sprite.name = "nameTag";
  group.add(sprite);
}

function updateNameTag(group: THREE.Group, name: string, isPlayer: boolean) {
  const sprite = group.getObjectByName("nameTag") as THREE.Sprite | undefined;
  if (!sprite) return;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = isPlayer ? "#28c840" : "rgba(255,255,255,0.9)";
  ctx.roundRect(0, 0, 256, 64, 12);
  ctx.fill();
  if (!isPlayer) {
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 3;
    ctx.roundRect(0, 0, 256, 64, 12);
    ctx.stroke();
  }
  ctx.fillStyle = isPlayer ? "#ffffff" : "#333333";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name || "Player", 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  (sprite.material as THREE.SpriteMaterial).map = tex;
  (sprite.material as THREE.SpriteMaterial).needsUpdate = true;
}

// ══════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════

export function GameWorld3D({ player, remotePlayers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    playerGroup: THREE.Group;
    remoteGroups: Map<string, THREE.Group>;
    raf: number;
  } | null>(null);

  // ── Initialize (mount once) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 400;
    const h = container.clientHeight || 600;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x78b8d8);
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();

    // Camera — top-down orthographic
    const aspect = w / h;
    const halfH = 500; // shows ~1000 SVG units vertically
    const halfW = halfH * aspect;
    const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0, 2000);
    camera.position.set(800, 600, -450);
    camera.up.set(0, 0, -1);
    camera.lookAt(800, 0, -450);
    camera.updateProjectionMatrix();

    // Lighting — bright and even
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(400, 800, -200);
    scene.add(dirLight);
    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x4a8a3a, 0.3));

    // Build world
    buildWorld(scene);

    // Player avatar
    const playerGroup = new THREE.Group();
    buildAvatar(playerGroup, player.config);
    playerGroup.position.set(player.x, 0, -player.y);
    scene.add(playerGroup);
    updateNameTag(playerGroup, player.name || "Player", true);

    stateRef.current = {
      renderer, scene, camera, playerGroup,
      remoteGroups: new Map(),
      raf: 0,
    };

    // ── Render loop ──
    const animate = () => {
      stateRef.current!.raf = requestAnimationFrame(animate);

      // Sync camera with cameraState
      const cs = cameraState;
      if (cs.vw > 0 && cs.vh > 0) {
        const cx = cs.x + cs.vw / 2;
        const cz = -(cs.y + cs.vh / 2);
        camera.position.set(cx, 600, cz);
        camera.lookAt(cx, 0, cz);
      } else {
        // Fallback: center on player
        camera.position.set(player.x, 600, -player.y);
        camera.lookAt(player.x, 0, -player.y);
      }
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ──
    const onResize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (nw > 0 && nh > 0) {
        renderer.setSize(nw, nh);
        const a = nw / nh;
        const hh = camera.top - camera.bottom;
        const hw = hh * a;
        camera.left = -hw;
        camera.right = hw;
        camera.updateProjectionMatrix();
      }
    };
    window.addEventListener("resize", onResize);

    // Also handle initial cameraState
    if (cameraState.vw <= 0 || cameraState.vh <= 0) {
      cameraState.x = 0;
      cameraState.y = 0;
      cameraState.vw = 1600;
      cameraState.vh = 900;
    }

    return () => {
      cancelAnimationFrame(stateRef.current!.raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      stateRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update player position (every render) ──
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const g = s.playerGroup;
    g.position.set(player.x, 0, -player.y);
    g.scale.x = player.facing < 0 ? -1 : 1;
    updateNameTag(g, player.name || "Player", true);
  }, [player.x, player.y, player.facing, player.name]);

  // ── Update remote players ──
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    const currentIds = new Set(remotePlayers.map(rp => rp.sessionId));

    // Remove stale
    s.remoteGroups.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        s.scene.remove(mesh);
        s.remoteGroups.delete(id);
      }
    });

    // Add/update
    remotePlayers.forEach(rp => {
      let mesh = s.remoteGroups.get(rp.sessionId);
      if (!mesh) {
        mesh = new THREE.Group();
        buildAvatar(mesh, rp.config);
        s.scene.add(mesh);
        s.remoteGroups.set(rp.sessionId, mesh);
      }
      mesh.position.set(rp.x, 0, -rp.y);
      mesh.scale.x = rp.facing < 0 ? -1 : 1;
      updateNameTag(mesh, rp.name || "Player", false);
    });
  }, [remotePlayers]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        overflow: "hidden",
        background: "#78b8d8",
      }}
    />
  );
}
