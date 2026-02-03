"use client";

import React from "react";
import * as THREE from "three";
import { Box, Plane } from "@react-three/drei";

export default function ShelfFactory({ type, width, height, depth, highlight, isBottom }) {
  // Common visual properties
  let frameColor = highlight ? "#7c3aed" : "#9ca3af";
  let fillColor = highlight ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)";



  const opacity = 0.35;
  const materialProps = { color: fillColor, transparent: true, opacity };
  const frameMaterialProps = { color: frameColor };

  // Helper for Frame Box (Uprights/Beams)
  const FrameBox = ({ args, position, rotation }) => (
    <Box args={args} position={position} rotation={rotation}>
      <meshStandardMaterial color={frameColor} />
    </Box>
  );

  switch (type) {
    case "SELECTIVE_PALLET":
      // Refined: 2 Upright Frames (4 posts) + Horizontal Beams.
      const postW = 0.08; // Slightly thinner posts for realism
      const beamH = 0.12; 
      
      return (
        <group>
            {/* --- Upright Frames (Left & Right) --- */}
            
            {/* Left Frame Posts */}
            <FrameBox args={[postW, height, postW]} position={[-width/2 + postW/2, 0, depth/2 - postW/2]} /> {/* Front-Left */}
            <FrameBox args={[postW, height, postW]} position={[-width/2 + postW/2, 0, -depth/2 + postW/2]} /> {/* Back-Left */}
            {/* Left Frame Bracing (Top/Bottom/Middle visual connection) */}
            <FrameBox args={[postW, 0.05, depth - 2*postW]} position={[-width/2 + postW/2, 0, 0]} /> {/* Mid Strut */}
            <FrameBox args={[postW, 0.05, depth - 2*postW]} position={[-width/2 + postW/2, height/2 - 0.025, 0]} /> {/* Top Strut */}
            <FrameBox args={[postW, 0.05, depth - 2*postW]} position={[-width/2 + postW/2, -height/2 + 0.025, 0]} /> {/* Bottom Strut */}

            {/* Right Frame Posts */}
            <FrameBox args={[postW, height, postW]} position={[width/2 - postW/2, 0, depth/2 - postW/2]} /> {/* Front-Right */}
            <FrameBox args={[postW, height, postW]} position={[width/2 - postW/2, 0, -depth/2 + postW/2]} /> {/* Back-Right */}
            {/* Right Frame Bracing */}
            <FrameBox args={[postW, 0.05, depth - 2*postW]} position={[width/2 - postW/2, 0, 0]} />
            <FrameBox args={[postW, 0.05, depth - 2*postW]} position={[width/2 - postW/2, height/2 - 0.025, 0]} />
            <FrameBox args={[postW, 0.05, depth - 2*postW]} position={[width/2 - postW/2, -height/2 + 0.025, 0]} />
            
            {/* --- Horizontal Beams (Front & Back) --- */}
            {/* Beam Front */}
            <FrameBox 
                args={[width - 2 * postW, beamH, 0.08]} 
                position={[0, height / 2 - beamH / 2, depth / 2 - 0.04]} // Just slightly offset from face
            />
            {/* Beam Back */}
            <FrameBox 
                args={[width - 2 * postW, beamH, 0.08]} 
                position={[0, height / 2 - beamH / 2, -depth / 2 + 0.04]} 
            />

            {/* Ghost Volume REMOVED for professional look */}
        </group>
      );

    case "CANTILEVER":
      // Cantilever: Central Back Spine, Forward Arms, Base (bottom only), X-Bracing.
      
      const spineW = 0.25;
      const spineD = 0.25;
      const armH = 0.1;
      const armW = 0.1;

      return (
        <group>
           {/* Spine (Back Center) - Thick Column */}
           <FrameBox 
             args={[spineW, height, spineD]} 
             position={[0, 0, -depth/2 + spineD/2]} 
           />

           {/* Arm (Beam extending from Spine to Front) */}
           {/* Positioned at the bottom of the current level technically, or visually comfortable? 
               User said "For each level, render a beam". Let's put it slightly offset up so objects sit on it, 
               or just centered vertically if the "level" implies the arm space. 
               Let's put it at the bottom of the level volume for logic. 
           */}
            <FrameBox 
                args={[armW, armH, depth - spineD]}
                position={[0, -height/2 + armH/2, spineD/2]} // Aligned with bottom of level volume
            />
            
            {/* Base (Only if bottom level) */}
            {isBottom && (
                <FrameBox 
                    args={[spineW, 0.2, depth]} 
                    position={[0, -height/2 + 0.1, 0]} 
                />
            )}

            {/* X-Bracing (Diagonal meshes connecting back spines adjacent) 
                Since we are per-bay, we simulate this with an X on the back plane.
            */}
             <group position={[0, 0, -depth/2]}>
                {/* Diagonal 1 */}
                <FrameBox 
                    args={[width, 0.05, 0.05]} 
                    position={[0, 0, 0]}
                    rotation={[0, 0, Math.PI / 4]} 
                />
                 {/* Diagonal 2 */}
                <FrameBox 
                    args={[width, 0.05, 0.05]} 
                    position={[0, 0, 0]}
                    rotation={[0, 0, -Math.PI / 4]} 
                />
             </group>
        </group>
      );

    case "DRIVE_IN":
      // Drive-In: 4 Uprights, Top/Back bracing, Side Rails, Clear Center.
      const postWidth = 0.1;
      const railWidth = 0.15;
      const railThickness = 0.05;
      
      return (
        <group>
            {/* 4 Vertical Uprights (Posts) */}
            {/* Front Left */}
            <FrameBox args={[postWidth, height, postWidth]} position={[-width/2 + postWidth/2, 0, depth/2 - postWidth/2]} />
            {/* Front Right */}
            <FrameBox args={[postWidth, height, postWidth]} position={[width/2 - postWidth/2, 0, depth/2 - postWidth/2]} />
            {/* Back Left */}
            <FrameBox args={[postWidth, height, postWidth]} position={[-width/2 + postWidth/2, 0, -depth/2 + postWidth/2]} />
            {/* Back Right */}
            <FrameBox args={[postWidth, height, postWidth]} position={[width/2 - postWidth/2, 0, -depth/2 + postWidth/2]} />

            {/* Side Rails (Ledges) along depth */}
            {/* Left Rail */}
            <FrameBox 
                args={[railWidth, railThickness, depth]} 
                position={[-width/2 + postWidth + railWidth/2 - 0.05, 0, 0]} 
            />
            {/* Right Rail */}
             <FrameBox 
                args={[railWidth, railThickness, depth]} 
                position={[width/2 - postWidth - railWidth/2 + 0.05, 0, 0]} 
            />

            {/* Top Bracing removed to keep vertical tunnel clear in stacked levels */}

            {/* Back Bracing (Additional Beam to connect back frame) */}
             <FrameBox 
                args={[width, 0.1, 0.1]} 
                position={[0, 0, -depth/2 + 0.05]} 
            />
        </group>
      );

    case "CARTON_FLOW":
        // Carton Flow: Side Frames, Tilted Roller Bed, Front Lip.
        
        // Tilt angle: 6 degrees downward towards front (+Z)
        const tilt = 6 * (Math.PI / 180); 
        // Dynamic Roller Calculation: approximately one roller track every 15cm? 
        // Or actually, rollers are typically distinct tracks.
        // Let's render "roller bars" across the full width, but repeat them down the depth?
        // Wait, user said: "If width increases, add more dividers/rollers rather than stretching".
        // This implies "lanes". So we should render Lanes of rollers.
        
        const laneWidth = 0.3; // 30cm lane
        const numLanes = Math.max(1, Math.floor(width / laneWidth));
        
        return (
            <group>
                {/* Side Frames (Left & Right) */}
                <FrameBox args={[0.05, height, depth]} position={[-width/2 + 0.025, 0, 0]} /> 
                <FrameBox args={[0.05, height, depth]} position={[width/2 - 0.025, 0, 0]} /> 

                {/* Tilted Bed Group */}
                <group rotation={[tilt, 0, 0]}>
                    {/* Render Lanes */}
                    {Array.from({ length: numLanes }).map((_, laneIdx) => {
                        // Center X of this lane
                        // Total width available for lanes ~ width - 0.1
                        // Distribute lanes evenly
                        const laneStep = (width - 0.1) / numLanes;
                        const laneX = - (width - 0.1) / 2 + laneStep/2 + (laneIdx * laneStep);
                        
                        return (
                            <group key={laneIdx} position={[laneX, 0, 0]}>
                                {/* Lane Track */}
                                <Box args={[laneStep - 0.02, 0.04, depth]} position={[0, 0, 0]}>
                                    <meshStandardMaterial color="#475569" />
                                </Box>
                                {/* Rollers specific to this lane (visual stripes) */}
                                {Array.from({ length: 5 }).map((_, rI) => (
                                     <Box 
                                        key={rI} 
                                        args={[laneStep - 0.04, 0.02, 0.05]} 
                                        position={[0, 0.03, -depth/2 + (depth/5)*(rI + 0.5)]}
                                     >
                                        <meshStandardMaterial color="#94a3b8" />
                                     </Box>
                                ))}
                            </group>
                        );
                    })}

                    {/* Front Lip (Stopper) spanning full width */}
                    <Box 
                        args={[width - 0.1, 0.1, 0.02]} 
                        position={[0, 0.05, depth/2]} 
                    >
                        <meshStandardMaterial color="#ef4444" />
                    </Box>
                </group>
            </group>
        );

    case "BIN_SHELVING":
       // Bin Shelving: Solid sides/back + DIVIDERS based on width.
       const bThick = 0.02;
       const binWidth = 0.4; // Target bin width
       const numBins = Math.max(1, Math.round(width / binWidth));
       
       return (
         <group>
            {/* Back Panel */}
            <FrameBox args={[width, height, bThick]} position={[0, 0, -depth/2 + bThick/2]} />
            
            {/* Side Panels */}
            <FrameBox args={[bThick, height, depth]} position={[-width/2 + bThick/2, 0, 0]} />
            <FrameBox args={[bThick, height, depth]} position={[width/2 - bThick/2, 0, 0]} />

            {/* Bottom/Top Deck */}
             <FrameBox args={[width, bThick, depth]} position={[0, -height/2 + bThick/2, 0]} />
             <FrameBox args={[width, bThick, depth]} position={[0, height/2 - bThick/2, 0]} />

             {/* Dividers */}
             {/* Iterate to create internal vertical dividers */}
             {Array.from({ length: numBins - 1 }).map((_, i) => {
                 // Spacing
                 const step = width / numBins;
                 const xPos = -width/2 + step * (i + 1);
                 return (
                     <FrameBox 
                        key={i}
                        args={[bThick, height - 0.1, depth - 0.05]} 
                        position={[xPos, 0, 0]} 
                     />
                 )
             })}
             
             {/* Render "Bin" boxes inside/ghosts? Or just the dividers is enough visual? 
                 Dividers are enough to show "Bin" structure. 
             */}
         </group>
       );

    case "HANGING_RACK":
       // Hanging Rack: 4-post frame, Cylindrical Rail(s), Clear bottom.
       
       const hPostW = 0.05;
       
       return (
         <group>
            {/* 4 Upright Posts */}
            <FrameBox args={[hPostW, height, hPostW]} position={[-width/2 + hPostW/2, 0, depth/2 - hPostW/2]} />
            <FrameBox args={[hPostW, height, hPostW]} position={[width/2 - hPostW/2, 0, depth/2 - hPostW/2]} />
            <FrameBox args={[hPostW, height, hPostW]} position={[-width/2 + hPostW/2, 0, -depth/2 + hPostW/2]} />
            <FrameBox args={[hPostW, height, hPostW]} position={[width/2 - hPostW/2, 0, -depth/2 + hPostW/2]} />

            {/* Top/Side Connections (Frame structure) - Optional but good for visual completeness */}
            <FrameBox args={[hPostW, 0.05, depth - 2*hPostW]} position={[-width/2 + hPostW/2, height/2 - 0.025, 0]} />
            <FrameBox args={[hPostW, 0.05, depth - 2*hPostW]} position={[width/2 - hPostW/2, height/2 - 0.025, 0]} />

            {/* The Rail: Cylindrical tube connecting left-front to right-front */}
            {/* CylinderGeometry args: [radiusTop, radiusBottom, height, radialSegments] 
                height here is the length of the rail (width).
                Default cylinder is vertical (Y-axis), so rotate 90 deg on Z (PI/2).
            */}
            <mesh 
                position={[0, height/2 - 0.1, depth/2 - hPostW*2]} 
                rotation={[0, 0, Math.PI / 2]}
            >
                <cylinderGeometry args={[0.02, 0.02, width - 2*hPostW, 16]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Conditional Second Rail if depth > 0.8m */}
            {depth > 0.8 && (
                <mesh 
                    position={[0, height/2 - 0.1, -depth/2 + hPostW*2]} 
                    rotation={[0, 0, Math.PI / 2]}
                >
                    <cylinderGeometry args={[0.02, 0.02, width - 2*hPostW, 16]} />
                    <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
                </mesh>
            )}
         </group>
       );

    case "COLD_LOCKER":
        // Frame: 4-post (Light Blue/Zinc)
        // Deck: Wire Mesh (Semi-transparent grid)
        // Enclosure: Back/Side panels (Glass/Insulated)
        // Air Gap: Visual gap at top (implicit by not filling it)
        
        const lockerPostW = 0.08;
        const lockerColor = "#0ea5e9"; // Sky Blue
        const glassColor = "#e0f2fe"; // Light Blue Ice
        
        return (
            <group>
                {/* 4 Upright Posts - Metallic Blue */}
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

                {/* Wire Mesh Deck */}
                {/* Simulated with a thin box having a wireframe material or textured appearance */}
                <Box args={[width - 0.1, 0.02, depth - 0.1]} position={[0, -height/2 + 0.05, 0]}>
                     <meshStandardMaterial color="#cbd5e1" wireframe={true} />
                </Box>
                 {/* Underneath solid deck (for visibility if wireframe is too thin) */}
                <Box args={[width - 0.1, 0.02, depth - 0.1]} position={[0, -height/2 + 0.05, 0]}>
                     <meshStandardMaterial color="#94a3b8" transparent opacity={0.3} />
                </Box>

                {/* Enclosure Panels (Back, Left, Right) - Insulated/Glass look */}
                {/* Back Panel */}
                <Box args={[width, height, 0.02]} position={[0, 0, -depth/2 + 0.01]}>
                    <meshPhysicalMaterial 
                        color={glassColor} 
                        transparent 
                        opacity={0.3} 
                        roughness={0.1}
                        transmission={0.2} // Glass-like
                        thickness={0.02}
                    />
                </Box>
                {/* Left Panel */}
                <Box args={[0.02, height, depth]} position={[-width/2 + 0.01, 0, 0]}>
                     <meshPhysicalMaterial 
                        color={glassColor} 
                        transparent 
                        opacity={0.3} 
                        roughness={0.1}
                        transmission={0.2}
                        thickness={0.02}
                    />
                </Box>
                {/* Right Panel */}
                <Box args={[0.02, height, depth]} position={[width/2 - 0.01, 0, 0]}>
                     <meshPhysicalMaterial 
                        color={glassColor} 
                        transparent 
                        opacity={0.3} 
                        roughness={0.1}
                        transmission={0.2}
                        thickness={0.02}
                    />
                </Box>
                
                {/* Top Air Gap: We just don't put a top panel, effectively leaving it open or "gapped" */}
            </group>
        );

    case "BULK_FLOOR_SPACE":
        // Bulk Floor: Orange Floor Pad, Ghost Box for volume.
        
        const padHeight = 0.1;
        const floorColor = "#f59e0b"; // Amber/Orange
        
        return (
            <group>
                 {/* Floor Pad - Only render if this is effectively the floor level or if we treat every 'level' as having a base?
                     User said: "Level 1 is the floor".
                     If isBottom (L1), render Pad.
                     If Upper levels, maybe just the ghost box? 
                     Let's render Pad for L1.
                 */}
                 {isBottom && (
                    <Box args={[width, padHeight, depth]} position={[0, -height/2 + padHeight/2, 0]}>
                        <meshStandardMaterial color={floorColor} transparent opacity={0.6} />
                    </Box>
                 )}
                 
                 {/* Ghost Bounding Box - to show the volume/allowable height */}
                 {/* Using edges to define the volume without solidifying it */}
                 <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
                    <lineBasicMaterial color={floorColor} opacity={0.3} transparent dashSize={0.2} gapSize={0.1} />
                 </lineSegments>

                 {/* If not bottom, maybe a faint fill to show it's multiple levels? */}
                 {!isBottom && (
                    <Box args={[width, height, depth]}>
                         <meshStandardMaterial color={floorColor} transparent opacity={0.05} />
                    </Box>
                 )}
            </group>
        );

    default:
      // Fallback: Standard Box
      return (
        <group>
          <mesh>
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color={frameMaterialProps.color} />
          </lineSegments>
        </group>
      );
  }
}
