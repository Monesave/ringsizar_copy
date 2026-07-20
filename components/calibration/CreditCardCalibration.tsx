'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { calculateCalibrationFactor, saveCalibration, CREDIT_CARD_WIDTH_MM } from '@/utils/calibration';
import { getDeviceId } from '@/utils/calibration';
import type { CalibrationData } from '@/types/measurement';

interface CreditCardCalibrationProps {
  onCalibrationComplete: (calibration: CalibrationData) => void;
  onCancel?: () => void;
}

export function CreditCardCalibration({ onCalibrationComplete, onCancel }: CreditCardCalibrationProps) {
  const { videoRef, isActive, hasPermission, error, startCamera, stopCamera, requestPermission } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [cardWidthPixels, setCardWidthPixels] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [endX, setEndX] = useState(0);
  const isMeasuringRef = useRef(false);
  const startXRef = useRef(0);
  const endXRef = useRef(0);

  useEffect(() => {
    if (hasPermission === null) {
      requestPermission();
    } else if (hasPermission) {
      startCamera();
    }
    return () => { stopCamera(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPermission]);

  useEffect(() => { isMeasuringRef.current = isMeasuring; }, [isMeasuring]);
  useEffect(() => { startXRef.current = startX; }, [startX]);
  useEffect(() => { endXRef.current = endX; }, [endX]);

  useEffect(() => {
    if (!isActive || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let rafId: number;

    const drawFrame = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const sx = startXRef.current;
        const ex = endXRef.current;

        if (isMeasuringRef.current && sx !== ex) {
          ctx.strokeStyle = '#00FF00';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(sx, canvas.height / 2);
          ctx.lineTo(ex, canvas.height / 2);
          ctx.stroke();
          const width = Math.abs(ex - sx);
          ctx.fillStyle = '#00FF00';
          ctx.font = '24px Arial';
          ctx.fillText(`${width.toFixed(0)} px`, (sx + ex) / 2, canvas.height / 2 - 10);
        }

        if (!isMeasuringRef.current) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(0, 0, canvas.width, 100);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '20px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('Place a credit card in the frame, then click "Start Measuring"', canvas.width / 2, 50);
        }
      }
      rafId = requestAnimationFrame(drawFrame);
    };

    drawFrame();
    return () => cancelAnimationFrame(rafId);
  }, [isActive, videoRef]); // only restart when camera becomes active

  const handleStartMeasuring = () => {
    setIsMeasuring(true);
    setStartX(0);
    setEndX(0);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMeasuring || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scaleX = canvasRef.current.width / rect.width;
    const scaledX = x * scaleX;
    
    setIsDragging(true);
    setStartX(scaledX);
    setEndX(scaledX);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMeasuring || !isDragging || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scaleX = canvasRef.current.width / rect.width;
    const scaledX = x * scaleX;
    
    setEndX(scaledX);
  };

  const handleCanvasMouseUp = () => {
    if (!isMeasuring || !isDragging) return;
    
    setIsDragging(false);
    const width = Math.abs(endX - startX);
    setCardWidthPixels(width);
  };

  const handleComplete = () => {
    if (!cardWidthPixels || cardWidthPixels <= 0) {
      alert('Please measure the credit card width first');
      return;
    }

    try {
      const calibrationFactor = calculateCalibrationFactor(cardWidthPixels);
      const calibration: CalibrationData = {
        id: `calibration_${Date.now()}`,
        deviceId: getDeviceId(),
        calibrationFactor,
        referenceSizeMm: CREDIT_CARD_WIDTH_MM,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      saveCalibration(calibration);
      onCalibrationComplete(calibration);
    } catch (error) {
      console.error('Calibration error:', error);
      alert('Failed to complete calibration. Please try again.');
    }
  };

  if (hasPermission === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h2 className="text-2xl font-bold mb-4">Camera Permission Required</h2>
        <p className="text-gray-600 mb-6 text-center">
          We need access to your camera to calibrate the measurement system.
        </p>
        {error && <p className="text-red-600 mb-4">{error}</p>}
        <button
          onClick={requestPermission}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Grant Camera Permission
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-4 px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen p-4">
      <h2 className="text-2xl font-bold mb-4">Credit Card Calibration</h2>
      <p className="text-gray-600 mb-4 text-center max-w-md">
        Place a standard credit card in the frame and measure its width to calibrate the system.
      </p>

      <div className="relative w-full max-w-2xl mb-4">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full rounded-lg"
          style={{ display: isActive ? 'block' : 'none' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full rounded-lg cursor-crosshair"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        />
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="flex gap-4">
        {!isMeasuring ? (
          <button
            onClick={handleStartMeasuring}
            disabled={!isActive}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            Start Measuring
          </button>
        ) : (
          <>
            <button
              onClick={handleComplete}
              disabled={!cardWidthPixels}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
            >
              Complete Calibration
            </button>
            <button
              onClick={() => {
                setIsMeasuring(false);
                setCardWidthPixels(null);
              }}
              className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              Reset
            </button>
          </>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        )}
      </div>

      {cardWidthPixels && (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-700">
            Measured width: <strong>{cardWidthPixels.toFixed(0)} pixels</strong>
          </p>
          <p className="text-sm text-gray-700">
            Expected width: <strong>{CREDIT_CARD_WIDTH_MM} mm</strong>
          </p>
          <p className="text-sm text-gray-700">
            Calibration factor: <strong>{(cardWidthPixels / CREDIT_CARD_WIDTH_MM).toFixed(2)} px/mm</strong>
          </p>
        </div>
      )}
    </div>
  );
}
