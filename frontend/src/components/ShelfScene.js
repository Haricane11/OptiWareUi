import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Text } from "@react-three/drei";
import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useWms } from "../context/WmsContext";
import ShelfFactory from "./ShelfFactory";

function CameraManager({ focusedZoneId, resetTrigger, zones, shelves, dims }) {
  const { camera, controls } = useThree();
  const isInitialMove = useRef(true);
  const isIntentionallyMoving = useRef(true);
  const lastEventId = useRef(null);

  // Initial view settings
  const INITIAL_POS = useMemo(() => new THREE.Vector3(dims.widthM * 2.2, dims.widthM * 2.2, dims.depthM * 2), [dims]);
  const INITIAL_TARGET = useMemo(() => new THREE.Vector3(dims.widthM / 2, 0, dims.depthM / 2), [dims]);

  // Reset move flag when inputs change
  useEffect(() => {
    const currentEventId = `${focusedZoneId}-${resetTrigger}`;
    if (lastEventId.current !== currentEventId) {
      isIntentionallyMoving.current = true;
      lastEventId.current = currentEventId;
    }
  }, [focusedZoneId, resetTrigger]);

  // Detect manual interaction to stop automatic movement
  useEffect(() => {
    if (!controls) return;

    const handleStart = () => {
      isIntentionallyMoving.current = false;
    };

    controls.addEventListener('start', handleStart);
    return () => controls.removeEventListener('start', handleStart);
  }, [controls]);

  useFrame(() => {
    if (!controls || !isIntentionallyMoving.current) return;

    let targetPos = INITIAL_POS;
    let targetLookAt = INITIAL_TARGET;

    if (focusedZoneId) {
      const zone = zones.find(z => String(z.id) === String(focusedZoneId));
      if (zone) {
        // Calculate max height of shelves in this zone to adjust framing
        const zoneShelves = shelves.filter(s => String(s.zone_id) === String(focusedZoneId));
        const maxHeight = zoneShelves.length > 0 
          ? Math.max(...zoneShelves.map(s => (s.location_z || 0) + (s.height || 0.8))) 
          : 0;

        const zCenterX = zone.location_x + (zone.width / 2);
        const zCenterY = zone.location_y + (zone.depth / 2);
        
        // Decisive target: Look at the middle height of the tallest shelf
        targetLookAt = new THREE.Vector3(zCenterX, maxHeight / 4, zCenterY);
        
        // Scale zoom distance based on both footprint and elevation (bay levels)
        const spatialDim = Math.max(zone.width, zone.depth, 2);
        const zoomDist = Math.max(spatialDim * 1.2, maxHeight * 10.0);
        
        targetPos = new THREE.Vector3(zCenterX + zoomDist * 0.4, zoomDist * 1.1, zCenterY + zoomDist * 0.4);
      }
    }

    // Centering is priority: Use a high lerp factor for the target
    camera.position.lerp(targetPos, 0.1);
    controls.target.lerp(targetLookAt, 0.25);
    controls.update();

    // Stop moving only when extremely close to the intended center
    if (controls.target.distanceTo(targetLookAt) < 0.05 && camera.position.distanceTo(targetPos) < 0.1) {
      isIntentionallyMoving.current = false;
    }
  });

  useEffect(() => {
    if (controls) {
      if (isInitialMove.current) {
        camera.position.copy(INITIAL_POS);
        controls.target.copy(INITIAL_TARGET);
        controls.update();
        isInitialMove.current = false;
        isIntentionallyMoving.current = false; // Don't fight initial stable state
      }
    }
  }, [controls, INITIAL_POS, INITIAL_TARGET, camera]);

  return null;
}

function Rack({ shelf, highlight, suggestedItem }) {
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

  // Logic for face-to-face arrangement based on bay number
  const shelfCode = shelf.shelf_code || shelf.name;
  if (shelfCode) {
    const bayMatch = shelfCode.match(/-B(\d+)-/); // Extracts number from -B<number>-
    if (bayMatch && bayMatch[1]) {
      const bayNumber = parseInt(bayMatch[1], 10);
      if (!isNaN(bayNumber) && bayNumber % 2 === 0) {
        rotationY += Math.PI; // Rotate 180 degrees for even bay numbers
      }
    }
  }

  const pendingBox = suggestedItem 
    && suggestedItem.measured_width > 0 
    && suggestedItem.measured_depth > 0 
    && suggestedItem.measured_height > 0
    ? {
        bw: suggestedItem.measured_width,
        bd: suggestedItem.measured_depth,
        bh: suggestedItem.measured_height,
        status: suggestedItem.status
      }
    : null;

  const boxes = Array.isArray(suggestedItem?.boxes) && suggestedItem.boxes.length > 0
    ? suggestedItem.boxes.filter(b => b.bw > 0 && b.bd > 0 && b.bh > 0)
    : (pendingBox ? [pendingBox] : []);

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

      {/* Pending placements: render boxes arranged in a 3D grid within shelf bounds */}
      {boxes && boxes.length > 0 && (
        <group>
          {(() => {
            const elements = [];
            const gap = 0.02;
            const availW = w * 0.9;
            const availD = d * 0.9;
            const baseY = -h / 2 + gap;
            let placed = 0;
            if (boxes.length > 0) {
              const bw = boxes[0].bw;
              const bd = boxes[0].bd;
              const bh = boxes[0].bh;
              const count = boxes.length;
              let cols = Math.max(1, Math.floor(availW / (bw + gap)));
              let layers = Math.max(1, Math.floor(availD / (bd + gap)));
              cols = Math.max(1, Math.min(cols, count));
              layers = Math.max(1, Math.min(layers, count));
              const capacityPerLayer = cols * layers;
              const rowsNeeded = Math.ceil(count / Math.max(1, capacityPerLayer));
              const sx = Math.min(1, (availW / Math.max(1, cols)) / (bw + gap));
              const sz = Math.min(1, (availD / Math.max(1, layers)) / (bd + gap));
              const sy = Math.min(1, ((h - gap * 2) / Math.max(1, rowsNeeded)) / (bh + gap));
              const dbw = bw * sx;
              const dbd = bd * sz;
              const dbh = bh * sy;
              const cellW = dbw + gap;
              const cellD = dbd + gap;
              const cellH = dbh + gap;
              for (let ry = 0; ry < rowsNeeded && placed < count; ry++) {
                for (let lz = 0; lz < layers && placed < count; lz++) {
                  for (let cx = 0; cx < cols && placed < count; cx++) {
                    const b = boxes[placed];
                    const xPos = -availW / 2 + dbw / 2 + cx * cellW;
                    const yPos = baseY + dbh / 2 + ry * cellH;
                    const zPos = -availD / 2 + dbd / 2 + lz * cellD;
                    elements.push(
                      <group key={`box-${placed}`} position={[xPos, yPos, zPos]}>
                        <mesh>
                          <boxGeometry args={[dbw, dbh, dbd]} />
                          <meshStandardMaterial 
                            color={b.status === 'placed' ? "#10b981" : "#facc15"} 
                            opacity={0.75} 
                            transparent 
                          />
                        </mesh>
                      </group>
                    );
                    placed++;
                  }
                }
              }
            }
            return elements;
          })()}
        </group>
      )}
      {/* Labels on the front surface */}
      <group position={[0, 0, d / 2 + 0.02]}>
        {/* Shelf Code (Main Label) */}
        <Text 
          position={[0, 0.04, 0]} 
          fontSize={0.06} 
          color="#1e293b" 
          anchorX="center" 
          anchorY="middle"
          maxWidth={w * 0.9}
        >
          {shelf.shelf_code || shelf.name}
        </Text>

        {/* SKU and Status (Below Shelf Code) - Only show if NOT placed */}
        {suggestedItem && suggestedItem.status !== 'placed' && (
          <Text 
            position={[0, -0.04, 0]} 
            fontSize={0.045} 
            color={suggestedItem.skus?.length > 0 ? "#854d0e" : "#b45309"} 
            anchorX="center" 
            anchorY="middle"
            maxWidth={w * 0.9}
          >
            {suggestedItem.skus?.length > 0 
              ? `PENDING: ${suggestedItem.skus.join(', ')}` 
              : "PENDING"}
          </Text>
        )}
      </group>
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

export default function ShelfScene({ selectedShelfId, floorId, focusedZoneId, resetTrigger, suggestedItems = {} }) {
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
    <Canvas camera={{ position: [dims.widthM * 2.2, dims.widthM * 2.2, dims.depthM * 2], fov: 20 }}>
      {/* Dynamic Camera Animation Manager */}
      <CameraManager 
        focusedZoneId={focusedZoneId} 
        resetTrigger={resetTrigger} 
        zones={state.zones} 
        shelves={state.shelves}
        dims={dims} 
      />

      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 14, 6]} intensity={1.2} />
      <directionalLight position={[-12, 10, -10]} intensity={0.6} />

      <WarehousePlane widthM={dims.widthM} depthM={dims.depthM} />

      {floorShelves.map((s) => (
        <Rack 
          key={s.id} 
          shelf={s} 
          highlight={s.id === selectedShelfId || String(s.zone_id) === String(focusedZoneId)} 
          suggestedItem={suggestedItems[s.id]}
        />
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

      <OrbitControls 
        makeDefault 
        enableDamping 
        dampingFactor={0.09} 
      />
    </Canvas>
  );
}
