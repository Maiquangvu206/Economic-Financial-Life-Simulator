import { memo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { ZoneType } from '../map/MapData';
import { ZONE_COLORS, ZONE_HEIGHT } from './zones';

export const TILE_SIZE = 5.6; // Kích thước cạnh ô 3D theo đơn vị thế giới (spacing 6)

export interface TileData {
  /** Tọa độ thế giới (x, z) trên đảo tròn. */
  x: number;
  y: number;
  /** Tọa độ game gốc (col, row) để trả về cho parent. */
  col: number;
  row: number;
  zone: ZoneType;
  name: string;
  /** Bán kính từ tâm đảo (0,0) — dùng hiển thị CBD. */
  radius: number;
  /** Điểm tròn nhân vật (property) có trên ô này không. */
  hasMarker?: boolean;
}

interface TileMeshProps {
  tile: TileData;
  selected: boolean;
  onHover: (tile: TileData | null) => void;
  onSelect: (tile: TileData) => void;
}

/**
 * Một ô đất 3D: BoxGeometry trên mặt phẳng XZ đảo tròn.
 * Hover: sáng ô; Click: trả TileData (bao gồm tọa độ thế giới + game).
 */
export const TileMesh = memo(function TileMesh({
  tile,
  selected,
  onHover,
  onSelect,
}: TileMeshProps) {
  const [hover, setHover] = useState(false);
  const color = ZONE_COLORS[tile.zone] ?? ZONE_COLORS.residential;
  const height = (ZONE_HEIGHT[tile.zone] ?? 0.2) * 8;
  // Ô không có đất (nước) thấp phẳng như mặt hồ.
  const h = tile.zone === 'water' ? 0.4 : height;

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

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect(tile);
  }

  return (
    <group position={[tile.x, 0, tile.y]}>
      <mesh
        castShadow={!tile.hasMarker}
        receiveShadow
        position={[0, h / 2, 0]}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <boxGeometry args={[TILE_SIZE, h, TILE_SIZE]} />
        <meshStandardMaterial
          color={color}
          roughness={0.85}
          metalness={0.05}
          emissive={selected ? '#f59e0b' : hover ? color : '#000000'}
          emissiveIntensity={selected ? 0.55 : hover ? 0.35 : 0}
        />
      </mesh>
      {selected && (
        <mesh position={[0, h + 0.05, 0]} receiveShadow>
          <boxGeometry args={[TILE_SIZE + 0.15, 0.08, TILE_SIZE + 0.15]} />
          <meshBasicMaterial color="#f59e0b" wireframe />
        </mesh>
      )}
    </group>
  );
});
