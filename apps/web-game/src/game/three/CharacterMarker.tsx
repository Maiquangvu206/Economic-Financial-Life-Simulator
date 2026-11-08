import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

interface CharacterMarkerProps {
  /** Vị trí mạng lưới (x, y) của điểm nhân vật. */
  position: [number, number, number];
  /** Màu marker: chủ sở hữu xanh lá, người khác vàng hổ phách. */
  owned: boolean;
  /** Độ dời pha để các marker nhấp nhô lệch nhau. */
  phase?: number;
}

/**
 * Điểm tròn nhân vật: hình cầu nổi nhẹ trên mặt ô đất,
 * lơ lửng theo hình sin (dùng useFrame).
 */
export function CharacterMarker({ position, owned, phase = 0 }: CharacterMarkerProps) {
  const mesh = useRef<Mesh>(null);
  const baseY = useMemo(() => position[2], [position]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    if (mesh.current) {
      mesh.current.position.y = baseY + Math.sin(t * 2) * 0.12;
    }
  });

  return (
    <mesh ref={mesh} position={[position[0], baseY, position[1]]} castShadow>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshStandardMaterial
        color={owned ? '#10b981' : '#f59e0b'}
        roughness={0.35}
        metalness={0.1}
        emissive={owned ? '#065f46' : '#92400e'}
        emissiveIntensity={0.35}
      />
    </mesh>
  );
}
