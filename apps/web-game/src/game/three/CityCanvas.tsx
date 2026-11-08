import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { InstancedMesh } from 'three';
import type { MapData, ZoneType } from '../map/MapData';
import { ZONE_COLORS } from './zones';
import { CharacterMarker } from './CharacterMarker';

interface CityCanvasProps {
  mapData?: MapData;
  onSelectPlot?: (col: number, row: number) => void;
}

/** Chế độ đảo tròn theo spec: mặt đảo Cylinder(R, R-4, 6, 64) đặt tại Y = -0.5. */
export const ISLAND_RADIUS = 100;
const ISLAND_DEPTH = 6;
const ISLAND_Y = -0.5;
/** Bán kính phủ kín lòng tròn cho lưới ô filler (theo spec cắt R=95). */
const FILL_RADIUS = 95;
/** Kích thước ô filler + bước nhảy lưới step = 2. */
const FILL_BOX = 1.8;
const FILL_STEP = 2;
/** Tâm đảo (0,0) = trung tâm thành phố; r < CBD_RADIUS là CBD đắt nhất. */
const CBD_RADIUS = 30;
/** Bước lưới dữ liệu game (1 ô = 6 đơn vị thế giới) để tính worldX/worldZ về tâm. */
const TILE_SPACING = 6;
/** Bán kính cắt hình tròn: chỉ render ô có khoảng cách tâm ≤ 95. */
const CLIP_RADIUS = 95;

/** Hash xác định để gán vùng cho ô filler (deterministic). */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

interface FillTile {
  x: number;
  z: number;
  zone: ZoneType;
  name: string;
}

/** Sinh lưới ô đất phủ kín lòng tròn: x,z ∈ [-100,100] bước 2, chỉ giữ √(x²+z²) ≤ 98. */
function generateFillTiles(): FillTile[] {
  const out: FillTile[] = [];
  for (let x = -ISLAND_RADIUS; x <= ISLAND_RADIUS; x += FILL_STEP) {
    for (let z = -ISLAND_RADIUS; z <= ISLAND_RADIUS; z += FILL_STEP) {
      const r = Math.sqrt(x * x + z * z);
      if (r > FILL_RADIUS) continue;
      let zone: ZoneType;
      if (r < CBD_RADIUS) {
        zone = 'commercial'; // CBD: đắt nhất
      } else {
        const n = hash2(x, z);
        if (n > 0.82) zone = 'park';
        else if (n > 0.68) zone = 'industrial';
        else if (n > 0.58) zone = 'civic';
        else if (n > 0.5) zone = 'slum';
        else zone = 'residential';
      }
      out.push({ x, z, zone, name: `Ô [${x}, ${z}]` });
    }
  }
  return out;
}

interface FillFieldProps {
  onHover: (tile: FillTile | null) => void;
}

/**
 * Lưới ô đất phủ kín (InstancedMesh — 1 draw call cho ~7.5k ô).
 * Hover nhấc ô lên Y +0.8 và phát sáng; click chỉ hiển thị tooltip.
 */
function FillField({ onHover }: FillFieldProps) {
  const tiles = useMemo(() => generateFillTiles(), []);
  const meshRef = useRef<InstancedMesh>(null);
  const helpers = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
    }),
    [],
  );
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const applyInstance = useCallback(
    (id: number, raised: boolean, highlighted: boolean) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const tile = tiles[id];
      if (!tile) return;
      const y = raised ? 0.8 + (ZONE_RAISES[tile.zone] ?? 0) : (ZONE_BASE[tile.zone] ?? 0);
      helpers.dummy.position.set(tile.x, y, tile.z);
      helpers.dummy.updateMatrix();
      mesh.setMatrixAt(id, helpers.dummy.matrix);
      const c = new THREE.Color(ZONE_COLORS[tile.zone] ?? ZONE_COLORS.residential);
      if (highlighted) c.lerp(new THREE.Color('#22d3ee'), 0.55);
      mesh.setColorAt(id, c);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    [tiles, helpers],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const c = new THREE.Color('#ffffff');
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i]!;
      helpers.dummy.position.set(tile.x, ZONE_BASE[tile.zone] ?? 0, tile.z);
      helpers.dummy.updateMatrix();
      mesh.setMatrixAt(i, helpers.dummy.matrix);
      c.set(ZONE_COLORS[tile.zone] ?? ZONE_COLORS.residential);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tiles, helpers]);

  function handleMove(event: ThreeEvent<PointerEvent>) {
    const id = event.instanceId ?? null;
    if (id === hoveredId) return;
    if (hoveredId != null) applyInstance(hoveredId, false, false);
    if (id != null) {
      applyInstance(id, true, true);
      setHoveredId(id);
      onHover(tiles[id] ?? null);
      document.body.style.cursor = 'pointer';
    } else {
      setHoveredId(null);
      onHover(null);
      document.body.style.cursor = 'auto';
    }
  }

  function handleOut() {
    if (hoveredId != null) applyInstance(hoveredId, false, false);
    setHoveredId(null);
    onHover(null);
    document.body.style.cursor = 'auto';
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, tiles.length]}
      castShadow
      receiveShadow
      onPointerMove={handleMove}
      onPointerOut={handleOut}
    >
      <boxGeometry args={[FILL_BOX, 0.4, FILL_BOX]} />
      <meshStandardMaterial roughness={0.85} metalness={0.05} />
    </instancedMesh>
  );
}

const ZONE_BASE: Record<ZoneType, number> = {
  commercial: 0.9,
  civic: 0.7,
  residential: 0.4,
  industrial: 0.3,
  park: 0.25,
  slum: 0.2,
  port: 0.1,
  water: 0.1,
};
const ZONE_RAISES: Record<ZoneType, number> = {
  commercial: 0,
  civic: 0,
  residential: 0,
  industrial: 0,
  park: 0,
  slum: 0,
  port: 0,
  water: 0,
};

/** Ô dữ liệu game (BĐS, mua đất) — giữ tương tác mua bán quen thuộc. */
interface DataTile {
  col: number;
  row: number;
  wx: number;
  wz: number;
  zone: ZoneType;
  name: string;
  radius: number;
  hasMarker: boolean;
}

function useDataTiles(mapData?: MapData): DataTile[] {
  return useMemo(() => {
    if (!mapData) return [];
    const cols = mapData.meta.cols || 32;
    const rows = mapData.meta.rows || 20;
    // Chuyển đổi hệ tọa độ về tâm (0, 0) theo đúng công thức offset:
    // worldX = col * TILE - offsetX + TILE / 2 (offsetX = COLS * TILE / 2).
    const offsetX = (cols * TILE_SPACING) / 2;
    const offsetZ = (rows * TILE_SPACING) / 2;
    const markerNodes = new Set<string>();
    const nodeById = new Map(mapData.nodes.map((n) => [n.id, n]));
    for (const p of mapData.properties ?? []) {
      const node = nodeById.get(p.nodeId);
      if (node) markerNodes.add(`${node.x}-${node.y}`);
    }
    const out: DataTile[] = [];
    for (const n of mapData.nodes) {
      const wx = n.x * TILE_SPACING - offsetX + TILE_SPACING / 2;
      const wz = n.y * TILE_SPACING - offsetZ + TILE_SPACING / 2;
      const radius = Math.sqrt(wx * wx + wz * wz);
      // Cắt hình tròn chuẩn: khoảng cách từ tâm > 95 thì không render.
      if (radius > CLIP_RADIUS) continue;
      // Tâm đảo: r < 30 là CBD — ép hiển thị vùng thương mại đắt nhất.
      const zone = (radius < CBD_RADIUS ? 'commercial' : n.zoneType) as ZoneType;
      out.push({
        col: n.x,
        row: n.y,
        wx,
        wz,
        zone,
        name: n.name,
        radius,
        hasMarker: markerNodes.has(`${n.x}-${n.y}`),
      });
    }
    return out;
  }, [mapData]);
}

/** Cảnh 3D đảo tròn nổi: đế R=100 + lưới phủ kín + marker. */
function CityScene({ mapData, onSelectPlot }: CityCanvasProps) {
  const tiles = useDataTiles(mapData);
  const [hovered, setHovered] = useState<TileData | null>(null);
  const [selected, setSelected] = useState<{ col: number; row: number } | null>(null);
  const [hoveredFill, setHoveredFill] = useState<FillTile | null>(null);

  const handleHover = useCallback((tile: TileData | null) => setHovered(tile), []);
  const handleSelect = useCallback(
    (tile: TileData) => {
      setSelected({ col: tile.col, row: tile.row });
      onSelectPlot?.(tile.col, tile.row);
    },
    [onSelectPlot],
  );

  // Điểm nhân vật: mỗi bất động sản có một marker nổi trên ô của nó.
  const markers = useMemo(() => {
    if (!mapData) return [];
    const nodeById = new Map(mapData.nodes.map((n) => [n.id, n]));
    const cols = mapData.meta.cols || 32;
    const rows = mapData.meta.rows || 20;
    const offsetX = (cols * TILE_SPACING) / 2;
    const offsetZ = (rows * TILE_SPACING) / 2;
    return (mapData.properties ?? []).flatMap((p) => {
      const node = nodeById.get(p.nodeId);
      if (!node) return [];
      return [
        {
          x: node.x * TILE_SPACING - offsetX + TILE_SPACING / 2,
          z: node.y * TILE_SPACING - offsetZ + TILE_SPACING / 2,
          owned: p.isMine,
          id: p.id,
        },
      ];
    });
  }, [mapData]);

  // Bán kính đế đủ rộng bao phủ toàn bộ ô đất: R = max(offsetX, offsetZ) + 5
  const cols = mapData?.meta.cols || 32;
  const rows = mapData?.meta.rows || 20;
  const offsetX = (cols * TILE_SPACING) / 2;
  const offsetZ = (rows * TILE_SPACING) / 2;
  const discRadius = Math.max(offsetX, offsetZ) + 5;

  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <fog attach="fog" args={['#eef4ff', 250, 700]} />

      <ambientLight intensity={0.75} color="#dbeafe" />
      <directionalLight
        position={[80, 100, 60]}
        intensity={1.25}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-40, 30, -50]} intensity={0.22} color="#bfdbfe" />

      {/* Đảo tròn nổi: CylinderGeometry(R, R-4, 6, 64) tại Y = -0.5,
          mặt trên màu xám titan, sườn metallic; R tự tính bao phủ toàn bộ ô đất. */}
      <mesh position={[0, ISLAND_Y, 0]} receiveShadow>
        <cylinderGeometry args={[discRadius, discRadius - 4, ISLAND_DEPTH, 64]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.65} metalness={0.25} />
      </mesh>
      <mesh position={[0, 2.4, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[discRadius, 64]} />
        <meshStandardMaterial color="#cbd5e1" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0, 2.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[discRadius - 1.5, discRadius, 64]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.8} />
      </mesh>

      {/* Lưới ô phủ kín lòng tròn (visual ground) */}
      <FillField onHover={setHoveredFill} />

      {/* Ô dữ liệu game (click mua đất / xem BĐS) — đã căn giữa (0,0) theo công thức offset */}
      {tiles.map((tile) => (
        <group key={`${tile.col}-${tile.row}`} position={[tile.wx, 2.4, tile.wz]}>
          <DataTileMesh
            tile={tile}
            selected={selected?.col === tile.col && selected?.row === tile.row}
            onHover={handleHover}
            onSelect={handleSelect}
          />
        </group>
      ))}
      {markers.map((m, i) => (
        <CharacterMarker key={m.id} position={[m.x, 3.4, m.z]} owned={m.owned} phase={i * 0.4} />
      ))}

      <Html
        position={[-discRadius + 8, 12, -discRadius + 8]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div className="rounded-lg bg-white/85 px-3 py-1 text-xs font-semibold text-emerald-800 shadow">
          🗺 {mapData?.provinceName ?? 'Bản đồ'} ({mapData?.provinceCode ?? '001'}) · Đảo tròn R=
          {discRadius.toFixed(0)}
        </div>
      </Html>

      <Html position={[0, 1, discRadius * 0.9]} center style={{ pointerEvents: 'none' }}>
        <div className="rounded-lg bg-white/85 px-2 py-1 text-[10px] text-slate-600 shadow">
          {hovered
            ? `Ô dữ liệu [${hovered.col}, ${hovered.row}] · ${hovered.name} · ${hovered.zone}`
            : hoveredFill
              ? `Đất hoang [${hoveredFill.x}, ${hoveredFill.z}] · ${hoveredFill.zone}${Math.sqrt(hoveredFill.x ** 2 + hoveredFill.z ** 2) < CBD_RADIUS ? ' · CBD' : ''}`
              : 'Xoay (kéo chuột) · Zoom (cuộn chuột) · Nhấn ô dữ liệu để xem'}
        </div>
      </Html>

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={20}
        maxDistance={600}
        maxPolarAngle={Math.PI / 2.15}
      />
    </>
  );
}

/** Ô dữ liệu game: khối nổi trên đảo, click trả (col, row) cho parent. */
function DataTileMesh({
  tile,
  selected,
  onHover,
  onSelect,
}: {
  tile: TileData;
  selected: boolean;
  onHover: (tile: TileData | null) => void;
  onSelect: (tile: TileData) => void;
}) {
  const [hover, setHover] = useState(false);
  const color = ZONE_COLORS[tile.zone] ?? ZONE_COLORS.residential;
  const h = (ZONE_HEIGHT_TILE[tile.zone] ?? 0.2) * 6;

  function handleOver(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    setHover(true);
    onHover(tile);
    document.body.style.cursor = 'pointer';
  }

  function handleOut(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    setHover(false);
    onHover(null);
    document.body.style.cursor = 'auto';
  }

  return (
    <mesh
      castShadow={!tile.hasMarker}
      receiveShadow
      position={[0, h / 2, 0]}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(tile);
      }}
    >
      <boxGeometry args={[TILE_SIZE, h, TILE_SIZE]} />
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        metalness={0.05}
        emissive={selected ? '#f59e0b' : hover ? '#22d3ee' : '#000000'}
        emissiveIntensity={selected ? 0.55 : hover ? 0.45 : 0}
      />
      {selected && (
        <mesh position={[0, h + 0.05, 0]}>
          <boxGeometry args={[TILE_SIZE + 0.15, 0.08, TILE_SIZE + 0.15]} />
          <meshBasicMaterial color="#f59e0b" wireframe />
        </mesh>
      )}
    </mesh>
  );
}

const TILE_SIZE = 5.6;
const ZONE_HEIGHT_TILE: Record<ZoneType, number> = {
  commercial: 0.6,
  civic: 0.45,
  residential: 0.3,
  industrial: 0.22,
  park: 0.18,
  slum: 0.15,
  port: 0.08,
  water: 0.05,
};

interface TileData {
  col: number;
  row: number;
  wx: number;
  wz: number;
  zone: ZoneType;
  name: string;
  radius: number;
  hasMarker?: boolean;
}

/**
 * Canvas 3D đảo tròn thay thế renderer Phaser 2D cho CityPage.
 * Giữ cùng contract với PhaserGame: mapData + onSelectPlot(col, row).
 */
export function CityCanvas(props: CityCanvasProps) {
  return (
    <div className="h-[520px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <Canvas shadows camera={{ position: [0, 150, 150], fov: 45, near: 0.1, far: 5000 }}>
        <CityScene {...props} />
      </Canvas>
      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        <span>Đảo tròn R=100 · Tâm (0,0) là CBD (r&lt;30) · Xoay 360° · Zoom</span>
        <span className="font-mono text-slate-600">3D</span>
      </div>
    </div>
  );
}
