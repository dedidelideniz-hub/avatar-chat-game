import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { cameraState } from "../world/cameraState";
import { VENDORS } from "@/lib/shop";
import type { AvatarConfig } from "@/lib/avatar";

/**
 * Pure Three.js 3D game scene — no R3F dependency.
 * Creates its own canvas, renderer, scene, camera.
 * Syncs with cameraState for SVG camera matching.
 */

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

// ── World dimensions ──
const W = 1600, H = 900;

// ── Helper: SVG (x,y) → Three.js Vector3 ──
function svgToWorld(x: number, svgY: number, yHeight = 0): [number, number, number] {
  return [x, yHeight, -svgY];
}

// ════════════════════════════════════════════
//  BUILD SCENE CONTENT
// ════════════════════════════════════════════

function buildScene(scene: THREE.Scene) {
  // ── GROUND ──
  const groundMat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });

  // Grass background
  const grassGeo = new THREE.PlaneGeometry(W, H);
  const grass = new THREE.Mesh(grassGeo, groundMat("#5a9a4a"));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(W / 2, -0.05, -H / 2);
  scene.add(grass);

  // Zone foundations (top-left: shops, top-right: park, bottom: houses/arena)
  const zones = [
    { cx: 360, cz: -245, w: 720, h: 490, c: "#c4b8a4" },   // shops
    { cx: 1240, cz: -245, w: 720, h: 490, c: "#4a8a3a" },   // park
    { cx: 360, cz: -825, w: 720, h: 150, c: "#c0b4a0" },    // houses
    { cx: 1240, cz: -825, w: 720, h: 150, c: "#b8b0a0" },   // arena
    { cx: 320, cz: -620, w: 640, h: 260, c: "#c4b8a4" },    // left strip
    { cx: 1280, cz: -620, w: 640, h: 260, c: "#4a8a3a" },   // right strip
    { cx: 800, cz: -825, w: 320, h: 150, c: "#c0b4a0" },    // bottom vert
    { cx: 800, cz: -245, w: 320, h: 490, c: "#c4b8a4" },    // top vert
  ];
  zones.forEach(z => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), groundMat(z.c));
    m.rotation.x = -Math.PI / 2;
    m.position.set(z.cx, -0.04, z.cz);
    scene.add(m);
  });

  // ── SIDEWALKS ──
  const swGeo = (w: number, h: number) => new THREE.PlaneGeometry(w, h);
  const sidewalks = [
    { cx: W / 2, cz: -525, w: W, h: 70 },     // north
    { cx: W / 2, cz: -715, w: W, h: 70 },     // south
  ];
  sidewalks.forEach(s => {
    const m = new THREE.Mesh(swGeo(s.w, s.h), groundMat("#c8c0b0"));
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.cx, -0.01, s.cz);
    scene.add(m);
  });

  // ── ROADS ──
  // Horizontal road
  const hRoad1 = new THREE.Mesh(new THREE.PlaneGeometry(640, 120), groundMat("#3a3a3c"));
  hRoad1.rotation.x = -Math.PI / 2;
  hRoad1.position.set(320, 0.005, -620);
  scene.add(hRoad1);

  const hRoad2 = new THREE.Mesh(new THREE.PlaneGeometry(640, 120), groundMat("#3a3a3c"));
  hRoad2.rotation.x = -Math.PI / 2;
  hRoad2.position.set(1280, 0.005, -620);
  scene.add(hRoad2);

  // Vertical road
  const vRoad1 = new THREE.Mesh(new THREE.PlaneGeometry(160, 490), groundMat("#3a3a3c"));
  vRoad1.rotation.x = -Math.PI / 2;
  vRoad1.position.set(800, 0.005, -245);
  scene.add(vRoad1);

  const vRoad2 = new THREE.Mesh(new THREE.PlaneGeometry(160, 150), groundMat("#3a3a3c"));
  vRoad2.rotation.x = -Math.PI / 2;
  vRoad2.position.set(800, 0.005, -825);
  scene.add(vRoad2);

  // Lane markings (white edge lines)
  const lineMat = new THREE.MeshBasicMaterial({ color: "#e8e4e0" });
  const yellowMat = new THREE.MeshBasicMaterial({ color: "#e8c84a" });

  // Horizontal edge lines
  [565, 675].forEach(svgY => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, 3), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(W / 2, 0.02, -svgY);
    scene.add(m);
  });

  // Center yellow lines (horizontal)
  [618, 622].forEach(svgY => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), yellowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(W / 2, 0.02, -svgY);
    scene.add(m);
  });

  // Vertical edge lines
  [725, 875].forEach(svgX => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, H), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(-svgX, 0.02, -H / 2);
    scene.add(m);
  });

  // ── PLAZA ──
  const plazaGeo = new THREE.CircleGeometry(140, 32);
  const plazaMat = groundMat("#b0a890");
  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(800, 0.01, -620);
  scene.add(plaza);

  // Plaza rings
  const ringGeo = new THREE.RingGeometry(90, 100, 32);
  const ring = new THREE.Mesh(ringGeo, groundMat("#a09880"));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(800, 0.015, -620);
  scene.add(ring);

  // ── PARK GRASS ──
  const parkGrass = new THREE.Mesh(new THREE.PlaneGeometry(640, 450), groundMat("#5a9a4a"));
  parkGrass.rotation.x = -Math.PI / 2;
  parkGrass.position.set(1240, -0.03, -245);
  scene.add(parkGrass);

  // ── BUILDINGS ──
  const buildings = [
    // Shops (top-left, facing south toward road)
    { x: 30, y: 100, w: 160, h: 350, ht: 120, c: "#e8a87c", sc: "#c87848", fl: 3 },
    { x: 210, y: 100, w: 120, h: 350, ht: 200, c: "#e8ecf0", sc: "#c0c4cc", fl: 5 },
    { x: 350, y: 100, w: 150, h: 350, ht: 150, c: "#f0d8b8", sc: "#d4b088", fl: 3 },
    { x: 520, y: 100, w: 160, h: 350, ht: 130, c: "#e8b088", sc: "#c88858", fl: 3 },
    // Shops along vertical road left
    { x: 30, y: 20, w: 140, h: 70, ht: 140, c: "#d49060", sc: "#b06838", fl: 4 },
    { x: 190, y: 20, w: 130, h: 65, ht: 110, c: "#e0e4ec", sc: "#b8bcc8", fl: 3 },
    { x: 340, y: 20, w: 150, h: 70, ht: 160, c: "#e4a0b0", sc: "#c87898", fl: 4 },
    { x: 510, y: 20, w: 120, h: 65, ht: 100, c: "#f0e8d0", sc: "#d8d0b8", fl: 2 },
    // Houses (bottom-left)
    { x: 30, y: 770, w: 120, h: 100, ht: 80, c: "#f0d0a8", sc: "#d4b080", fl: 2 },
    { x: 170, y: 770, w: 100, h: 100, ht: 70, c: "#e8c8a0", sc: "#c8a878", fl: 2 },
    { x: 290, y: 770, w: 130, h: 100, ht: 90, c: "#f8e0c0", sc: "#dcc098", fl: 2 },
    { x: 440, y: 770, w: 110, h: 100, ht: 75, c: "#e0c090", sc: "#c4a068", fl: 2 },
    { x: 570, y: 770, w: 120, h: 100, ht: 85, c: "#f0d8b8", sc: "#d4b888", fl: 2 },
    // Arena (bottom-right)
    { x: 920, y: 770, w: 200, h: 100, ht: 110, c: "#b04040", sc: "#903030", fl: 3 },
    { x: 1140, y: 770, w: 130, h: 100, ht: 90, c: "#906040", sc: "#704828", fl: 2 },
    { x: 1290, y: 770, w: 140, h: 100, ht: 80, c: "#a08060", sc: "#806040", fl: 2 },
    { x: 1450, y: 770, w: 120, h: 100, ht: 95, c: "#8890a0", sc: "#687080", fl: 2 },
  ];

  buildings.forEach(b => {
    const cx = b.x + b.w / 2;
    const baseZ = -b.y;
    const depth = b.h;

    // Front face
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.ht, 2),
      new THREE.MeshStandardMaterial({ color: b.c })
    );
    front.position.set(cx, b.ht / 2, baseZ);
    scene.add(front);

    // Side face
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(20, b.ht, depth),
      new THREE.MeshStandardMaterial({ color: b.sc })
    );
    side.position.set(b.x + b.w + 10, b.ht / 2, baseZ - depth / 2);
    scene.add(side);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 4, 3, depth + 4),
      new THREE.MeshStandardMaterial({ color: "#505058" })
    );
    roof.position.set(cx, b.ht + 1.5, baseZ - depth / 2);
    scene.add(roof);

    // Windows
    const winColor = "#6ab0d6";
    const storyH = b.ht / b.fl;
    const winsPerFloor = Math.max(1, Math.floor(b.w / 55));
    const winSpacing = b.w / (winsPerFloor + 1);
    for (let f = 0; f < b.fl; f++) {
      for (let wi = 0; wi < winsPerFloor; wi++) {
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(Math.min(24, b.w / 6), Math.min(26, storyH - 16), 1),
          new THREE.MeshStandardMaterial({ color: winColor })
        );
        win.position.set(b.x + winSpacing * (wi + 1), storyH * 0.45 + f * storyH + b.ht * 0.05, baseZ - 1.5);
        scene.add(win);
      }
    }
  });

  // ── TREES (park area) ──
  const treePositions = [
    [980, 120], [1100, 80], [1240, 160], [1380, 100], [1500, 140],
    [1040, 260], [1180, 300], [1320, 340], [1460, 280],
    [1120, 420], [1300, 430], [1450, 400],
  ];

  const leafColors = ["#2d9a3a", "#3aad48", "#44b852", "#5ed06a", "#80e878", "#38a845"];
  const trunkColor = "#b87a3d";

  treePositions.forEach(([tx, ty], i) => {
    const [wx, wy, wz] = svgToWorld(tx, ty);

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 4, 20, 8),
      new THREE.MeshStandardMaterial({ color: trunkColor })
    );
    trunk.position.set(wx, 10, wz);
    scene.add(trunk);

    // Leaf clusters (puffy spheres)
    const clusters = [
      [0, 28, 0], [-10, 22, 5], [10, 24, -4],
      [0, 34, 0], [-6, 36, 3], [6, 35, -2],
      [0, 40, 0], [12, 20, 6], [-12, 26, -5],
    ];
    const radii = [12, 9, 8, 10, 7, 7, 6, 7, 8];

    clusters.forEach((pos, j) => {
      const leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry(radii[j], 1),
        new THREE.MeshStandardMaterial({
          color: leafColors[(i + j) % leafColors.length],
        })
      );
      leaf.position.set(wx + pos[0], pos[1], wz + pos[2]);
      scene.add(leaf);
    });
  });

  // ── VENDOR STALLS ──
  VENDORS.forEach(v => {
    const [wx, wy, wz] = svgToWorld(v.x, v.y);

    // Table
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(70, 6, 28),
      new THREE.MeshStandardMaterial({ color: "#5b4636" })
    );
    table.position.set(wx, 22, wz);
    scene.add(table);

    // Table top
    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(64, 3, 24),
      new THREE.MeshStandardMaterial({ color: "#7a5c3f" })
    );
    tableTop.position.set(wx, 26, wz);
    scene.add(tableTop);

    // Awning poles
    [-32, 32].forEach(px => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 30, 6),
        new THREE.MeshStandardMaterial({ color: "#6b4a2f" })
      );
      pole.position.set(wx + px, 40, wz);
      scene.add(pole);
    });

    // Awning
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(78, 2.5, 32),
      new THREE.MeshStandardMaterial({ color: v.color })
    );
    awning.position.set(wx, 55, wz);
    scene.add(awning);
  });

  // ── LAMP POSTS ──
  const lampPositions = [
    [700, 500], [900, 500], [700, 740], [900, 740],
    [500, 500], [1100, 500],
  ];
  lampPositions.forEach(([lx, ly]) => {
    const [wx, wy, wz] = svgToWorld(lx, ly);

    // Base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 6),
      new THREE.MeshStandardMaterial({ color: "#4a4540" })
    );
    base.position.set(wx, 2, wz);
    scene.add(base);

    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.5, 40, 6),
      new THREE.MeshStandardMaterial({ color: "#5a5550" })
    );
    pole.position.set(wx, 22, wz);
    scene.add(pole);

    // Lamp head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(8, 5, 8),
      new THREE.MeshStandardMaterial({ color: "#6a6560" })
    );
    head.position.set(wx, 44, wz);
    scene.add(head);

    // Light bulb
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(3, 8, 8),
      new THREE.MeshStandardMaterial({ color: "#ffd166", emissive: "#ffd166", emissiveIntensity: 0.5 })
    );
    bulb.position.set(wx, 41, wz);
    scene.add(bulb);
  });

  // ── HEDGES (north sidewalk) ──
  [100, 250, 400, 550].forEach(hx => {
    const [wx, wy, wz] = svgToWorld(hx, 530);
    const hedge = new THREE.Mesh(
      new THREE.BoxGeometry(50, 12, 12),
      new THREE.MeshStandardMaterial({ color: "#2d7a38" })
    );
    hedge.position.set(wx, 6, wz);
    scene.add(hedge);
  });

  // ── FOUNTAIN (plaza center) ──
  const ftn = svgToWorld(800, 620);
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(18, 20, 8, 16),
    new THREE.MeshStandardMaterial({ color: "#8090a0" })
  );
  pool.position.set(ftn[0], 4, ftn[2]);
  scene.add(pool);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 2, 16),
    new THREE.MeshStandardMaterial({ color: "#4a90d0", transparent: true, opacity: 0.6 })
  );
  water.position.set(ftn[0], 7, ftn[2]);
  scene.add(water);

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 5, 20, 8),
    new THREE.MeshStandardMaterial({ color: "#a0a0a0" })
  );
  pillar.position.set(ftn[0], 18, ftn[2]);
  scene.add(pillar);

  // ── MAP BORDER HEDGES ──
  [100, 250, 400, 550, 700].forEach(by => {
    const [wx, wy, wz] = svgToWorld(15, by);
    const h = new THREE.Mesh(
      new THREE.BoxGeometry(20, 10, 50),
      new THREE.MeshStandardMaterial({ color: "#2d7a38" })
    );
    h.position.set(wx, 5, wz);
    scene.add(h);

    const [wx2] = svgToWorld(1585, by);
    const h2 = h.clone();
    h2.position.set(wx2, 5, wz);
    scene.add(h2);
  });

  // ── FLOWER BOXES (south sidewalk) ──
  [180, 420, 660, 1080, 1380].forEach(fx => {
    const [wx, wy, wz] = svgToWorld(fx, 800);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(14, 6, 8),
      new THREE.MeshStandardMaterial({ color: "#7a5a30" })
    );
    box.position.set(wx, 3, wz);
    scene.add(box);

    ["#ff6b6b", "#ffd166", "#ff6bcb"].forEach((fc, j) => {
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(2.5, 6, 6),
        new THREE.MeshStandardMaterial({ color: fc })
      );
      flower.position.set(wx + (j - 1) * 4, 8, wz);
      scene.add(flower);
    });
  });

  // ── BENCHES ──
  [[350, 810], [1150, 810]].forEach(([bx, by]) => {
    const [wx, wy, wz] = svgToWorld(bx, by);
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(24, 3, 8),
      new THREE.MeshStandardMaterial({ color: "#7a5a30" })
    );
    seat.position.set(wx, 8, wz);
    scene.add(seat);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(24, 8, 2.5),
      new THREE.MeshStandardMaterial({ color: "#7a5a30" })
    );
    back.position.set(wx, 14, wz - 3.5);
    scene.add(back);
  });

  // ── BACKGROUND BUILDINGS (behind shops, semi-transparent) ──
  const bgBuildings = [
    { x: -10, y: -80, w: 70, h: 60, ht: 180 },
    { x: 80, y: -90, w: 55, h: 50, ht: 220 },
    { x: 200, y: -70, w: 60, h: 55, ht: 160 },
    { x: 320, y: -85, w: 50, h: 50, ht: 200 },
    { x: 440, y: -75, w: 65, h: 60, ht: 190 },
    { x: 560, y: -90, w: 55, h: 50, ht: 170 },
  ];
  const bgColors = ["#b0b8c4", "#a8b0bc", "#bcc4d0", "#a0a8b4", "#b4bcc8", "#b0b8c4"];

  bgBuildings.forEach((b, i) => {
    const cx = b.x + b.w / 2;
    const baseZ = -(b.y + b.h / 2);
    const bg = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.ht, 25),
      new THREE.MeshStandardMaterial({ color: bgColors[i], transparent: true, opacity: 0.45 })
    );
    bg.position.set(cx, b.ht / 2, baseZ);
    scene.add(bg);
  });
}

// ════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════

export function GameWorld3D({ player, remotePlayers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const playerMeshRef = useRef<THREE.Group | null>(null);
  const remoteMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const rafRef = useRef<number>(0);

  // ── Initialize Three.js ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x78b8d8);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera (top-down orthographic)
    const aspect = container.clientWidth / container.clientHeight;
    const vh = 900;
    const vw = vh * aspect;
    const camera = new THREE.OrthographicCamera(
      -vw / 2, vw / 2, vh / 2, -vh / 2, 0, 1000
    );
    camera.position.set(800, 500, -450);
    camera.up.set(0, 0, -1);
    camera.lookAt(800, 0, -450);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(400, 600, -200);
    scene.add(dirLight);
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a8a3a, 0.3);
    scene.add(hemiLight);

    // Build the world
    buildScene(scene);

    // ── Player avatar group ──
    const playerGroup = new THREE.Group();
    buildAvatar(playerGroup, player.config);
    scene.add(playerGroup);
    playerMeshRef.current = playerGroup;

    // ── Render loop ──
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      // Sync camera with cameraState
      const { x, y, vw: cvw, vh: cvh } = cameraState;
      if (cvw > 0 && cvh > 0) {
        const cx = x + cvw / 2;
        const cz = -(y + cvh / 2);
        camera.position.set(cx, 500, cz);
        const aspect2 = container.clientWidth / container.clientHeight;
        const halfH = cvh / 2;
        const halfW = halfH * aspect2;
        camera.left = -halfW;
        camera.right = halfW;
        camera.top = halfH;
        camera.bottom = -halfH;
        camera.lookAt(cx, 0, cz);
        camera.updateProjectionMatrix();
      }

      renderer.render(scene, camera);
    };
    animate();

    // ── Resize handler ──
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        renderer.setSize(w, h);
        const aspect2 = w / h;
        const halfH = camera.top - camera.bottom;
        const halfW = halfH * aspect2;
        camera.left = -halfW;
        camera.right = halfW;
        camera.updateProjectionMatrix();
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update player position ──
  useEffect(() => {
    const g = playerMeshRef.current;
    if (!g) return;
    g.position.set(player.x, 0, -player.y);
    g.scale.x = player.facing < 0 ? -1 : 1;
  }, [player.x, player.y, player.facing]);

  // ── Update remote players ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentIds = new Set(remotePlayers.map(rp => rp.sessionId));

    // Remove old meshes
    remoteMeshesRef.current.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        scene.remove(mesh);
        remoteMeshesRef.current.delete(id);
      }
    });

    // Add/update meshes
    remotePlayers.forEach(rp => {
      let mesh = remoteMeshesRef.current.get(rp.sessionId);
      if (!mesh) {
        mesh = new THREE.Group();
        buildAvatar(mesh, rp.config);
        scene.add(mesh);
        remoteMeshesRef.current.set(rp.sessionId, mesh);
      }
      mesh.position.set(rp.x, 0, -rp.y);
      mesh.scale.x = rp.facing < 0 ? -1 : 1;
    });
  }, [remotePlayers]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        overflow: "hidden",
      }}
    />
  );
}

// ════════════════════════════════════════════
//  AVATAR BUILDER
// ════════════════════════════════════════════

function buildAvatar(group: THREE.Group, config: AvatarConfig) {
  const skinColor = config.skin || "#f0b888";
  const shirtColor = config.shirt || "#4488cc";
  const pantsColor = config.pants || "#334455";
  const shoesColor = config.shoes || "#444444";
  const hairColor = config.hairColor || "#332211";

  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(14, 16, 10),
    new THREE.MeshStandardMaterial({ color: shirtColor })
  );
  body.position.y = 20;
  group.add(body);

  // Head
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(12, 12, 11),
    new THREE.MeshStandardMaterial({ color: skinColor })
  );
  head.position.y = 34;
  group.add(head);

  // Hair
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(14, 5, 13),
    new THREE.MeshStandardMaterial({ color: hairColor })
  );
  hair.position.y = 40;
  group.add(hair);

  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#1a1a2e" });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 1.5), eyeMat);
  eyeL.position.set(-3, 35, 5.5);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 1.5), eyeMat);
  eyeR.position.set(3, 35, 5.5);
  group.add(eyeR);

  // Arms
  const armMat = new THREE.MeshStandardMaterial({ color: skinColor });
  [-9, 9].forEach(x => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 5), armMat);
    arm.position.set(x, 22, 0);
    group.add(arm);
  });

  // Legs
  const legMat = new THREE.MeshStandardMaterial({ color: pantsColor });
  [-4, 4].forEach(x => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 6), legMat);
    leg.position.set(x, 8, 0);
    group.add(leg);
  });

  // Shoes
  const shoeMat = new THREE.MeshStandardMaterial({ color: shoesColor });
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
  shadow.position.y = 0.5;
  group.add(shadow);
}
