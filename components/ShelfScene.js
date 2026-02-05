"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Text } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { useWms } from "../context/WmsContext";
import ShelfFactory from "./ShelfFactory";

function Rack({ shelf, highlight }) {
  const w = shelf.width;
  const h = shelf.height; // Height of this specific level
  const d = shelf.depth;

  // Position is center of the box
  const pos = [
    shelf.location_x + w / 2, 
    shelf.location_z + h / 2, 
    shelf.location_y + d / 2
  ];
  const rotationY = shelf.facing === 'negative' ? Math.PI : 0;

  return (
    <group position={pos} rotation={[0, rotationY, 0]}>
      <ShelfFactory 
        type={shelf.type} 
        width={w} 
        height={h} 
        depth={d} 
        highlight={highlight}
        isBottom={shelf.level_code === 'L1'}
      />

      {/* Text Label on top of this level */}
      {/* Text Label Logic */}
      {shelf.type === 'BULK_FLOOR_SPACE' ? (
        // Bulk Floor: Horizontal on top surface
        <Text 
            position={[0, h / 2 + 0.01, 0]} 
            rotation={[-Math.PI / 2, 0, 0]} 
            fontSize={0.25} // Slightly larger for floor
            color="black" 
            anchorX="center" 
            anchorY="middle"
        >
            {shelf.name}
        </Text>
      ) : (
        // Racks: Front-facing on the face
        <Text 
            position={[0, 0, d / 2 + 0.05]} 
            fontSize={0.15} 
            color="black" 
            anchorX="center" 
            anchorY="middle"
        >
            {shelf.name}
        </Text>
      )}
    </group>
  );
}

function Stairs({ x, y, width = 2, depth = 2, floorName }) {
    return (
        <group position={[x + width/2, 1.5, y + depth/2]}>
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[width, 3, depth]} />
                <meshStandardMaterial color="#ef4444" opacity={0.8} transparent />
            </mesh>
             <Text position={[0, 2, 0]} fontSize={0.5} color="white" anchorX="center" anchorY="middle">
                STAIRS
            </Text>
        </group>
    )
}

function WarehousePlane({ widthM, depthM }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[widthM / 2, -0.01, depthM / 2]}>
        <planeGeometry args={[widthM, depthM]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <Grid position={[widthM / 2, 0, depthM / 2]} args={[widthM, depthM]} cellSize={1} cellThickness={1} cellColor="#cbd5e1" sectionSize={5} sectionThickness={1.5} sectionColor="#94a3b8" fadeDistance={50} />
    </group>
  );
}

export default function ShelfScene({ selectedShelfId, floorId }) {
  const { state } = useWms();

  const dims = useMemo(
    () => ({ widthM: state.warehouseDims.widthM || 20, depthM: state.warehouseDims.depthM || 20 }),
    [state.warehouseDims.widthM, state.warehouseDims.depthM]
  );
  
  // Filter shelves by floor (via zones)
  const floorZones = state.zones.filter(z => z.floor_id === floorId).map(z => z.id);
  const floorShelves = state.shelves.filter(s => floorZones.includes(s.zone_id));
  
  const currentFloor = state.floors.find(f => f.id === floorId);

  return (
    <Canvas camera={{ position: [dims.widthM * 0.8, 12, dims.depthM * 1.1], fov: 45 }}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 14, 6]} intensity={1.2} />
      <directionalLight position={[-12, 10, -10]} intensity={0.6} />

      <WarehousePlane widthM={dims.widthM} depthM={dims.depthM} />

      {floorShelves.map((s) => (
        <Rack key={s.id} shelf={s} highlight={s.id === selectedShelfId} />
      ))}
      
      {currentFloor && (
          <Stairs 
            x={currentFloor.stairs_location.x} 
            y={currentFloor.stairs_location.y} 
            width={currentFloor.stair_width}
            depth={currentFloor.stair_depth}
            floorName={currentFloor.name} 
          />
      )}

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
