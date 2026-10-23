'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { X, Camera, Sparkles, AlertCircle, RefreshCw, Smartphone } from 'lucide-react';

interface CameraQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedText: string) => void;
  title?: string;
  subtitle?: string;
}

export function CameraQRScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Vault QR Code',
  subtitle = 'Point camera at the QR code displayed on your other device',
}: CameraQRScannerModalProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopStream = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Tick loop for live camera frame decoding
  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameIdRef.current = requestAnimationFrame(tick);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animFrameIdRef.current = requestAnimationFrame(tick);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code && code.data && code.data.trim().length > 0) {
      // Detected QR Code!
      stopStream();
      setIsScanning(false);
      onScan(code.data.trim());
      onClose();
      return;
    }

    animFrameIdRef.current = requestAnimationFrame(tick);
  }, [onScan, onClose, stopStream]);

  // Start live camera stream
  const startCamera = useCallback(async () => {
    stopStream();
    setCameraError(null);
    setIsScanning(true);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError('Live camera not supported in this browser. Please use the Camera / Google Lens button below.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS Safari
        await videoRef.current.play();
        animFrameIdRef.current = requestAnimationFrame(tick);
      }
    } catch (err: unknown) {
      console.warn('Camera access error:', err);
      setCameraError('Camera access unavailable or permission denied. Use the Camera / Google Lens button below.');
    }
  }, [tick, stopStream]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopStream();
    }

    return () => {
      stopStream();
    };
  }, [isOpen, startCamera, stopStream]);

  // Fallback: Decode QR image from file / Native Camera / Google Lens
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setCameraError(null);

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const offscreenCanvas = document.createElement('canvas');
          offscreenCanvas.width = img.naturalWidth || img.width;
          offscreenCanvas.height = img.naturalHeight || img.height;
          const ctx = offscreenCanvas.getContext('2d');
          if (!ctx) {
            setCameraError('Failed to initialize image decoder context.');
            setIsProcessingFile(false);
            return;
          }

          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height);

          if (code && code.data) {
            stopStream();
            onScan(code.data.trim());
            onClose();
          } else {
            setCameraError('No valid QR code was detected in the captured photo. Please try again.');
          }
          setIsProcessingFile(false);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File scan error:', err);
      setCameraError('Failed to process photo.');
      setIsProcessingFile(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl border border-[#E5DCD4] shadow-apple-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#E5DCD4] flex items-center justify-between bg-[#F8F3F0]/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#0071E3] to-[#AF52DE] text-white flex items-center justify-center shadow-xs">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[15px] sm:text-[16px] font-bold text-[#1A1A1A] tracking-tight">{title}</h3>
              <p className="text-[11px] sm:text-[12px] text-[#6B6B6B]">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="p-1.5 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-white rounded-full transition-colors tap-spring cursor-pointer"
            title="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative bg-black flex-1 min-h-[280px] sm:min-h-[320px] flex items-center justify-center overflow-hidden">
          {/* Hidden HTML5 Video and Canvas */}
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted />
          <canvas ref={canvasRef} className="hidden" />

          {/* Apple Chromatic Viewfinder Reticle */}
          {isScanning && !cameraError && (
            <div className="relative z-10 w-56 h-56 sm:w-64 sm:h-64 border-2 border-white/30 rounded-3xl p-1 pointer-events-none flex items-center justify-center shadow-2xl">
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#0071E3] rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#5856D6] rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#AF52DE] rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#FF2D55] rounded-br-xl" />

              {/* Animated Glowing Laser Scan Line */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#0071E3] to-transparent animate-pulse shadow-[0_0_12px_#0071E3]" />
            </div>
          )}

          {/* Camera Error / Fallback Card */}
          {cameraError && (
            <div className="z-20 p-5 bg-black/85 text-white max-w-xs text-center rounded-2xl mx-4 space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-[12px] sm:text-[13px] leading-relaxed text-zinc-300">{cameraError}</p>
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[12px] font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Controls Footer */}
        <div className="p-4 sm:p-5 bg-white border-t border-[#E5DCD4] space-y-2.5">
          {/* Native Camera / Google Lens Capture Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <button
            type="button"
            disabled={isProcessingFile}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 sm:py-3.5 bg-gradient-to-r from-[#014BAA] to-[#0071E3] hover:from-[#013A85] hover:to-[#005bb5] text-white text-[13px] sm:text-[14px] font-semibold rounded-2xl shadow-apple transition-all tap-spring cursor-pointer flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            <span>{isProcessingFile ? 'Decoding Photo...' : 'Open Camera / Google Lens'}</span>
          </button>

          <p className="text-[11px] text-center text-[#9B9B9B] font-mono">
            Align the QR code within the frame to authorize instantly with 0 keystrokes
          </p>
        </div>
      </div>
    </div>
  );
}
