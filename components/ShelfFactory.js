"use client";

import React from "react";
import * as THREE from "three";
import { Box } from "@react-three/drei";

/**
 * Helper component declared OUTSIDE the render function 
 * to prevent re-creation and state reset errors.
 */
const FrameBox = ({ args, position, rotation, color }) => (
  <Box args={args} position={position} rotation={rotation}>
    <meshStandardMaterial color={color} />
  </Box>
);

export default function ShelfFactory({ type, width, height, depth, highlight, isBottom }) {
  // Common visual properties
  const frameColor = highlight ? "#7c3aed" : "#9ca3af";
  const fillColor = highlight ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)";
  const opacity = 0.35;
  const materialProps = { color: fillColor, transparent: true, opacity };

  switch (type) {
    case "SELECTIVE_PALLET": {
      const postW = 0.08;
      const beamH = 0.12; 
      
      return (
        <group>
            {/* Left Frame */}
            <FrameBox color={frameColor} args={[postW, height, postW]} position={[-width/2 + postW/2, 0, depth/2 - postW/2]} />
            <FrameBox color={frameColor} args={[postW, height, postW]} position={[-width/2 + postW/2, 0, -depth/2 + postW/2]} />
            <FrameBox color={frameColor} args={[postW, 0.05, depth - 2*postW]} position={[-width/2 + postW/2, 0, 0]} />
            <FrameBox color={frameColor} args={[postW, 0.05, depth - 2*postW]} position={[-width/2 + postW/2, height/2 - 0.025, 0]} />
            <FrameBox color={frameColor} args={[postW, 0.05, depth - 2*postW]} position={[-width/2 + postW/2, -height/2 + 0.025, 0]} />

            {/* Right Frame */}
            <FrameBox color={frameColor} args={[postW, height, postW]} position={[width/2 - postW/2, 0, depth/2 - postW/2]} />
            <FrameBox color={frameColor} args={[postW, height, postW]} position={[width/2 - postW/2, 0, -depth/2 + postW/2]} />
            <FrameBox color={frameColor} args={[postW, 0.05, depth - 2*postW]} position={[width/2 - postW/2, 0, 0]} />
            <FrameBox color={frameColor} args={[postW, 0.05, depth - 2*postW]} position={[width/2 - postW/2, height/2 - 0.025, 0]} />
            <FrameBox color={frameColor} args={[postW, 0.05, depth - 2*postW]} position={[width/2 - postW/2, -height/2 + 0.025, 0]} />
            
            {/* Horizontal Beams */}
            <FrameBox color={frameColor} args={[width - 2 * postW, beamH, 0.08]} position={[0, height / 2 - beamH / 2, depth / 2 - 0.04]} />
            <FrameBox color={frameColor} args={[width - 2 * postW, beamH, 0.08]} position={[0, height / 2 - beamH / 2, -depth / 2 + 0.04]} />
        </group>
      );
    }

    case "CANTILEVER": {
      const spineW = 0.25;
      const spineD = 0.25;
      const armH = 0.1;
      const armW = 0.1;

      return (
        <group>
           <FrameBox color={frameColor} args={[spineW, height, spineD]} position={[0, 0, -depth/2 + spineD/2]} />
           <FrameBox color={frameColor} args={[armW, armH, depth - spineD]} position={[0, -height/2 + armH/2, spineD/2]} />
            
            {isBottom && (
                <FrameBox color={frameColor} args={[spineW, 0.2, depth]} position={[0, -height/2 + 0.1, 0]} />
            )}

             <group position={[0, 0, -depth/2]}>
                <FrameBox color={frameColor} args={[width, 0.05, 0.05]} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 4]} />
                <FrameBox color={frameColor} args={[width, 0.05, 0.05]} position={[0, 0, 0]} rotation={[0, 0, -Math.PI / 4]} />
             </group>
        </group>
      );
    }

    case "DRIVE_IN": {
      const postWidth = 0.1;
      const railWidth = 0.15;
      const railThickness = 0.05;
      
      return (
        <group>
            <FrameBox color={frameColor} args={[postWidth, height, postWidth]} position={[-width/2 + postWidth/2, 0, depth/2 - postWidth/2]} />
            <FrameBox color={frameColor} args={[postWidth, height, postWidth]} position={[width/2 - postWidth/2, 0, depth/2 - postWidth/2]} />
            <FrameBox color={frameColor} args={[postWidth, height, postWidth]} position={[-width/2 + postWidth/2, 0, -depth/2 + postWidth/2]} />
            <FrameBox color={frameColor} args={[postWidth, height, postWidth]} position={[width/2 - postWidth/2, 0, -depth/2 + postWidth/2]} />

            <FrameBox color={frameColor} args={[railWidth, railThickness, depth]} position={[-width/2 + postWidth + railWidth/2 - 0.05, 0, 0]} />
            <FrameBox color={frameColor} args={[railWidth, railThickness, depth]} position={[width/2 - postWidth - railWidth/2 + 0.05, 0, 0]} />

             <FrameBox color={frameColor} args={[width, 0.1, 0.1]} position={[0, 0, -depth/2 + 0.05]} />
        </group>
      );
    }

    case "CARTON_FLOW": {
        const tilt = 6 * (Math.PI / 180); 
        
        return (
            <group>
                <FrameBox color={frameColor} args={[0.05, height, depth]} position={[-width/2 + 0.025, 0, 0]} /> 
                <FrameBox color={frameColor} args={[0.05, height, depth]} position={[width/2 - 0.025, 0, 0]} /> 

                <group rotation={[tilt, 0, 0]}>
                    <Box args={[width - 0.1, 0.04, depth]} position={[0, 0, 0]}>
                        <meshStandardMaterial color="#475569" />
                    </Box>
                    {Array.from({ length: 5 }).map((_, rI) => (
                         <Box key={rI} args={[width - 0.14, 0.02, 0.05]} position={[0, 0.03, -depth/2 + (depth/5)*(rI + 0.5)]}>
                            <meshStandardMaterial color="#94a3b8" />
                         </Box>
                    ))}
                    <Box args={[width - 0.1, 0.1, 0.02]} position={[0, 0.05, depth/2]}>
                        <meshStandardMaterial color="#ef4444" />
                    </Box>
                </group>
            </group>
        );
    }

    case "BIN_SHELVING": {
       const bThick = 0.02;
       
       return (
         <group>
            <FrameBox color={frameColor} args={[width, height, bThick]} position={[0, 0, -depth/2 + bThick/2]} />
            <FrameBox color={frameColor} args={[bThick, height, depth]} position={[-width/2 + bThick/2, 0, 0]} />
            <FrameBox color={frameColor} args={[bThick, height, depth]} position={[width/2 - bThick/2, 0, 0]} />
            <FrameBox color={frameColor} args={[width, bThick, depth]} position={[0, -height/2 + bThick/2, 0]} />
            <FrameBox color={frameColor} args={[width, bThick, depth]} position={[0, height/2 - bThick/2, 0]} />
         </group>
       );
    }

    case "HANGING_RACK": {
       const hPostW = 0.05;
       return (
         <group>
            <FrameBox color={frameColor} args={[hPostW, height, hPostW]} position={[-width/2 + hPostW/2, 0, depth/2 - hPostW/2]} />
            <FrameBox color={frameColor} args={[hPostW, height, hPostW]} position={[width/2 - hPostW/2, 0, depth/2 - hPostW/2]} />
            <FrameBox color={frameColor} args={[hPostW, height, hPostW]} position={[-width/2 + hPostW/2, 0, -depth/2 + hPostW/2]} />
            <FrameBox color={frameColor} args={[hPostW, height, hPostW]} position={[width/2 - hPostW/2, 0, -depth/2 + hPostW/2]} />

            <FrameBox color={frameColor} args={[hPostW, 0.05, depth - 2*hPostW]} position={[-width/2 + hPostW/2, height/2 - 0.025, 0]} />
            <FrameBox color={frameColor} args={[hPostW, 0.05, depth - 2*hPostW]} position={[width/2 - hPostW/2, height/2 - 0.025, 0]} />

            <mesh position={[0, height/2 - 0.1, depth/2 - hPostW*2]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.02, 0.02, width - 2*hPostW, 16]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
            </mesh>

            {depth > 0.8 && (
                <mesh position={[0, height/2 - 0.1, -depth/2 + hPostW*2]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.02, 0.02, width - 2*hPostW, 16]} />
                    <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
                </mesh>
            )}
         </group>
       );
    }

    case "COLD_LOCKER": {
        const lockerPostW = 0.08;
        const lockerColor = "#0ea5e9";
        const glassColor = "#e0f2fe";
        
        return (
            <group>
                <Box args={[lockerPostW, height, lockerPostW]} position={[-width/2 + lockerPostW/2, 0, depth/2 - lockerPostW/2]}>
                    <meshStandardMaterial color={lockerColor} metalness={0.6} roughness={0.2} />
                </Box>
                <Box args={[lockerPostW, height, lockerPostW]} position={[width/2 - lockerPostW/2, 0, depth/2 - lockerPostW/2]}>
                    <meshStandardMaterial color={lockerColor} metalness={0.6} roughness={0.2} />
                </Box>
                <Box args={[lockerPostW, height, lockerPostW]} position={[-width/2 + lockerPostW/2, 0, -depth/2 + lockerPostW/2]}>
                    <meshStandardMaterial color={lockerColor} metalness={0.6} roughness={0.2} />
                </Box>
                <Box args={[lockerPostW, height, lockerPostW]} position={[width/2 - lockerPostW/2, 0, -depth/2 + lockerPostW/2]}>
                    <meshStandardMaterial color={lockerColor} metalness={0.6} roughness={0.2} />
                </Box>

                <Box args={[width - 0.1, 0.02, depth - 0.1]} position={[0, -height/2 + 0.05, 0]}>
                     <meshStandardMaterial color="#cbd5e1" wireframe={true} />
                </Box>
                <Box args={[width - 0.1, 0.02, depth - 0.1]} position={[0, -height/2 + 0.05, 0]}>
                     <meshStandardMaterial color="#94a3b8" transparent opacity={0.3} />
                </Box>

                <Box args={[width, height, 0.02]} position={[0, 0, -depth/2 + 0.01]}>
                    <meshPhysicalMaterial color={glassColor} transparent opacity={0.3} roughness={0.1} transmission={0.2} thickness={0.02} />
                </Box>
                <Box args={[0.02, height, depth]} position={[-width/2 + 0.01, 0, 0]}>
                     <meshPhysicalMaterial color={glassColor} transparent opacity={0.3} roughness={0.1} transmission={0.2} thickness={0.02} />
                </Box>
                <Box args={[0.02, height, depth]} position={[width/2 - 0.01, 0, 0]}>
                     <meshPhysicalMaterial color={glassColor} transparent opacity={0.3} roughness={0.1} transmission={0.2} thickness={0.02} />
                </Box>
            </group>
        );
    }

    case "BULK_FLOOR_SPACE": {
        const floorColor = "#f59e0b";
        return (
            <group>
                 {isBottom && (
                    <Box args={[width, 0.1, depth]} position={[0, -height/2 + 0.05, 0]}>
                        <meshStandardMaterial color={floorColor} transparent opacity={0.6} />
                    </Box>
                 )}
                 <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
                    <lineBasicMaterial color={floorColor} opacity={0.3} transparent />
                 </lineSegments>
                 {!isBottom && (
                    <Box args={[width, height, depth]}>
                         <meshStandardMaterial color={floorColor} transparent opacity={0.05} />
                    </Box>
                 )}
            </group>
        );
    }

    default:
      return (
        <group>
          <mesh>
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color={frameColor} />
          </lineSegments>
        </group>
      );
  }
}