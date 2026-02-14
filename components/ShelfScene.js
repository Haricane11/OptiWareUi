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
  // Convert orientation_angle (degrees) to radians. Fallback to 'facing' for backward compatibility.
  let rotationY = 0;
  if (typeof shelf.orientation_angle === 'number') {
    rotationY = (shelf.orientation_angle * Math.PI) / 180;
  } else if (shelf.facing === 'negative') {
    rotationY = Math.PI;
  }

  return (
    <group position={pos} rotation={[0, rotationY, 0]}>
      <ShelfFactory 
        type={shelf.shelf_type || shelf.type} 
        width={w} 
        height={h} 
        depth={d} 
        highlight={highlight}
        isBottom={shelf.level_num === 1}
      />

      {/* Text Label vertically on the front surface */}
      <Text 
          position={[0, 0, d / 2 + 0.02]} 
          fontSize={0.06} 
          color="#1e293b" 
          anchorX="center" 
          anchorY="middle"
          maxWidth={w * 0.9}
      >
          {shelf.shelf_code || shelf.name}
      </Text>
    </group>
  );
}

function Area({ x, y, width = 2, depth = 2, height = 3, label = 'Area', isPassable = true }) {
    const color = isPassable ? "#10b981" : "#ef4444"; // Emerald-500 for Aisle, Rose-500 for Obstacle
    return (
        <group position={[x + width/2, height/2, y + depth/2]}>
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[width, height, depth]} />
                <meshStandardMaterial color={color} opacity={isPassable ? 0.4 : 0.8} transparent />
            </mesh>
             <Text position={[0, height/2 + 0.5, 0]} fontSize={0.5} color="white" anchorX="center" anchorY="middle">
                {label}
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
      
      {currentFloor && Array.isArray(currentFloor.areas) && currentFloor.areas.map((ar, idx) => (
          <Area 
            key={idx}
            x={ar.location_x || ar.x || 0} 
            y={ar.location_y || ar.y || 0} 
            width={ar.width || currentFloor.area_width || 2}
            depth={ar.depth || currentFloor.area_depth || 2}
            height={ar.height || 3}
            label={ar.area_name} 
            isPassable={ar.is_passable ?? true}
          />
      ))}

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
