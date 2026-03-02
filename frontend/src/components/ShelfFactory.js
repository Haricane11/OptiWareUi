"use client";

import React from "react";
import * as THREE from "three";
import { Box, Text } from "@react-three/drei";

const FrameBox = ({ args, position, rotation, color, opacity = 1 }) => (
  <Box args={args} position={position} rotation={rotation}>
    <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />
  </Box>
);

export default function ShelfFactory({ type, width, height, depth, highlight, suggestedVolume, isPlaced, isBottom, label }) {
  const isSuggested = suggestedVolume !== undefined && suggestedVolume !== null;
  const frameColor = highlight ? "#8b5cf6" : "#9ca3af";
  const fillRatio = isSuggested && width && height && depth ? Math.min(suggestedVolume / (width * height * depth), 1.0) : 0;
  const postW = 0.04; // Thickness for structural posts
  const plateH = 0.02; // Thickness for shelf plates

  switch (type) {
    case "SELECTIVE_PALLET": {
      const beamH = 0.12;
      return (
        <group>
          {/* 4 Vertical Posts */}
          <FrameBox color={frameColor} args={[postW, height, postW]} position={[-width / 2 + postW / 2, 0, depth / 2 - postW / 2]} />
          <FrameBox color={frameColor} args={[postW, height, postW]} position={[width / 2 - postW / 2, 0, depth / 2 - postW / 2]} />
          <FrameBox color={frameColor} args={[postW, height, postW]} position={[-width / 2 + postW / 2, 0, -depth / 2 + postW / 2]} />
          <FrameBox color={frameColor} args={[postW, height, postW]} position={[width / 2 - postW / 2, 0, -depth / 2 + postW / 2]} />

          {/* Load Beams (Front and Back) */}
          <FrameBox color={frameColor} args={[width, beamH, 0.05]} position={[0, -height / 2 + beamH / 2, depth / 2 - 0.025]} />
          <FrameBox color={frameColor} args={[width, beamH, 0.05]} position={[0, -height / 2 + beamH / 2, -depth / 2 + 0.025]} />

          {isSuggested && (
            <FrameBox color={isPlaced ? "#10b981" : "#eab308"} args={[width * 0.9, height * fillRatio, depth * 0.9]} position={[0, -height / 2 + (height * fillRatio) / 2 + plateH, 0]} opacity={0.8} />
          )}

          {/* {isSuggested && (
            <Text
              position={[0, height / 2 + 0.3, depth / 2]}
              fontSize={0.25}
              color="#eab308"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              PENDING
            </Text>
          )} */}
        </group>
      );
    }

    case "BIN_SHELVING": {
      return (
        <group>
          {/* Vertical Side Panels (Hollow middle) */}
          <FrameBox color={frameColor} args={[postW, height, depth]} position={[-width / 2 + postW / 2, 0, 0]} />
          <FrameBox color={frameColor} args={[postW, height, depth]} position={[width / 2 - postW / 2, 0, 0]} />
          
          {/* Bottom Plate */}
          <FrameBox color={frameColor} args={[width, plateH, depth]} position={[0, -height / 2 + plateH / 2, 0]} />
          
          {/* Top Plate */}
          <FrameBox color={frameColor} args={[width, plateH, depth]} position={[0, height / 2 - plateH / 2, 0]} />

          {label && (
            <Text
              position={[0, -height / 2 + plateH + 0.01, depth / 2 + 0.01]}
              fontSize={0.06}
              color="black"
              anchorX="center"
              anchorY="bottom"
            >
              {label}
            </Text>
          )}

          {isSuggested && (
            <FrameBox color={isPlaced ? "#10b981" : "#eab308"} args={[width * 0.9, height * fillRatio, depth * 0.9]} position={[0, -height / 2 + (height * fillRatio) / 2 + plateH, 0]} opacity={0.8} />
          )}

          {/* {isSuggested && (
            <Text
              position={[0, height / 2 + 0.3, depth / 2]}
              fontSize={0.25}
              color="#eab308"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              PENDING
            </Text>
          )} */}
        </group>
      );
    }

    case "BULK_FLOOR_SPACE": {
      const floorColor = highlight ? "#f59e0b" : "#94a3b8";
      return (
        <group>
          {/* Only a bottom floor marker and a wireframe boundary */}
          <FrameBox color={floorColor} args={[width, 0.01, depth]} position={[0, -height / 2, 0]} opacity={0.5} />
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color={floorColor} />
          </lineSegments>

          {isSuggested && (
            <FrameBox color={isPlaced ? "#10b981" : "#eab308"} args={[width * 0.9, height * fillRatio, depth * 0.9]} position={[0, -height / 2 + (height * fillRatio) / 2 + 0.01, 0]} opacity={0.8} />
          )}

          {/* {isSuggested && (
            <Text
              position={[0, height / 2 + 0.3, depth / 2]}
              fontSize={0.25}
              color="#eab308"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              PENDING
            </Text>
          )} */}
        </group>
      );
    }

    default:
      return (
        <group>
          {/* Default Hollow Construction: 4 Posts + 1 Bottom Plate */}
          <FrameBox color={frameColor} args={[postW, height, postW]} position={[-width / 2 + postW / 2, 0, depth / 2 - postW / 2]} />
          <FrameBox color={frameColor} args={[postW, height, postW]} position={[width / 2 - postW / 2, 0, depth / 2 - postW / 2]} />
          <FrameBox color={frameColor} args={[postW, height, postW]} position={[-width / 2 + postW / 2, 0, -depth / 2 + postW / 2]} />
          <FrameBox color={frameColor} args={[postW, height, postW]} position={[width / 2 - postW / 2, 0, -depth / 2 + postW / 2]} />
          
          {/* Horizontal Plate */}
          <FrameBox color={frameColor} args={[width, plateH, depth]} position={[0, -height / 2 + plateH / 2, 0]} />
          
          {/* Subtle Wireframe for the volume */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color={frameColor} transparent opacity={0.2} />
          </lineSegments>

          {isSuggested && (
            <FrameBox color={isPlaced ? "#10b981" : "#eab308"} args={[width * 0.9, height * fillRatio, depth * 0.9]} position={[0, -height / 2 + (height * fillRatio) / 2 + plateH, 0]} opacity={0.8} />
          )}

          {/* {isSuggested && (
            <Text
              position={[0, height / 2 + 0.3, depth / 2]}
              fontSize={0.25}
              color="#eab308"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              PENDING
            </Text>
          )} */}
        </group>
      );
  }
}