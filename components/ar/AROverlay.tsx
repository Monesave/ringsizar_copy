'use client';

import React, { useEffect, useRef } from 'react';
import { HandTracker, type HandDetection } from '@/lib/mediapipe/handTracker';
import type { Finger } from '@/types/measurement';

interface AROverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  handTracker: HandTracker | null;
  selectedFinger: Finger | null;
  showLandmarks: boolean;
  showRingOverlay: boolean;
  ringSize?: string;
}

export function AROverlay({
  videoRef,
  canvasRef,
  handTracker,
  selectedFinger,
  showLandmarks,
  showRingOverlay,
  ringSize,
}: AROverlayProps) {
  const animationFrameRef = useRef<number>();
  const selectedFingerRef = useRef(selectedFinger);
  const showLandmarksRef = useRef(showLandmarks);
  const showRingOverlayRef = useRef(showRingOverlay);
  const ringSizeRef = useRef(ringSize);

  // Keep refs in sync without restarting the draw loop
  useEffect(() => { selectedFingerRef.current = selectedFinger; }, [selectedFinger]);
  useEffect(() => { showLandmarksRef.current = showLandmarks; }, [showLandmarks]);
  useEffect(() => { showRingOverlayRef.current = showRingOverlay; }, [showRingOverlay]);
  useEffect(() => { ringSizeRef.current = ringSize; }, [ringSize]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !handTracker) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        try {
          const detections = handTracker.detectHands(video);
          detections.forEach((detection) => {
            if (showLandmarksRef.current) {
              handTracker.drawLandmarks(ctx, detection, true);
            }
            if (showRingOverlayRef.current && selectedFingerRef.current) {
              drawRingOverlay(ctx, detection, selectedFingerRef.current, ringSizeRef.current);
            }
          });
        } catch (error) {
          console.error('Hand detection error:', error);
        }
      }
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [videoRef, canvasRef, handTracker]); // only restart when core deps change

  const drawRingOverlay = (
    ctx: CanvasRenderingContext2D,
    detection: HandDetection,
    finger: Finger,
    size?: string
  ) => {
    // Get finger landmark indices
    const fingerIndices: Record<Finger, number[]> = {
      thumb: [2, 3, 4],
      index: [5, 6, 7, 8],
      middle: [9, 10, 11, 12],
      ring: [13, 14, 15, 16],
      little: [17, 18, 19, 20],
    };

    const indices = fingerIndices[finger];
    if (!indices || indices.length < 2) return;

    // Get the proximal phalanx region (where ring sits)
    const mcpIndex = indices[0]; // MCP joint
    const pipIndex = indices[1]; // PIP joint

    const mcp = detection.landmarks[mcpIndex];
    const pip = detection.landmarks[pipIndex];

    if (!mcp || !pip) return;

    // Calculate finger direction
    const dx = pip.x - mcp.x;
    const dy = pip.y - mcp.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return;

    // Get perpendicular direction for ring width
    const perpX = -dy / length;
    const perpY = dx / length;

    // Estimate ring width (simplified - would use actual measurement)
    const ringWidth = length * 0.4; // Rough estimate

    // Draw ring outline at the proximal phalanx
    const centerX = mcp.x + (dx * 0.3); // Slightly below MCP
    const centerY = mcp.y + (dy * 0.3);

    // Draw ring as an ellipse
    ctx.strokeStyle = '#FFD700'; // Gold color
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(
      centerX,
      centerY,
      ringWidth / 2,
      ringWidth * 0.6, // Slightly oval
      Math.atan2(dy, dx),
      0,
      2 * Math.PI
    );
    ctx.stroke();

    // Draw size label
    if (size) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        `Size ${size}`,
        centerX,
        centerY - ringWidth / 2 - 10
      );
    }
  };

  return null; // This component only handles drawing, no DOM elements
}
