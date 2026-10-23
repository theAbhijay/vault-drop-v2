'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  X,
  Camera,
  SwitchCamera,
  Zap,
  ZapOff,
  Upload,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

interface CameraQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedText: string) => void;
  title?: string;
  subtitle?: string;
}

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return win.BarcodeDetector ?? null;
}

/**
 * In-browser dual-engine QR scanner (BarcodeDetector + jsQR fallback).
 *
 * v3 fixes: camera lifecycle is keyed on facingMode only (parent re-renders
 * can no longer restart the stream), every async path is unmount-safe, photo
 * decode errors always clear the spinner, the success callback fires exactly
 * once, and the modal implements dialog semantics (role, Escape, focus restore).
 */
export function CameraQRScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Vault QR Code',
  subtitle = 'Point camera at the QR code displayed on your other device',
}: CameraQRScannerModalProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef<boolean>(false);
  const isScanningRef = useRef<boolean>(true);
  const isMountedRef = useRef<boolean>(true);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Ref indirection for the recursive rAF loop (self-referencing useCallback
  // captures a stale binding; scheduling through the ref always runs latest).
  const scanLoopRef = useRef<() => void>(() => {});

  // Latest callbacks in refs — identity changes from parents must never
  // restart the camera or the scan loop.
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  // Stop camera media tracks cleanly
  const stopStream = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    detectorRef.current = null;
    isScanningRef.current = false;
  }, []);

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  // Handle successful QR detection — fires the callback exactly once, and the
  // hand-off to the parent is cancellable if the modal closes first.
  const handleSuccess = useCallback(
    (scannedText: string) => {
      if (firedRef.current) return;
      firedRef.current = true;
      isScanningRef.current = false;

      setIsScanning(false);
      setIsSuccess(true);
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([60, 40, 80]);
        }
      } catch {
        // ignore
      }

      stopStream();

      successTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        onScanRef.current(scannedText);
        onCloseRef.current();
      }, 500);
    },
    [stopStream]
  );

  // Scan frame processing loop (Hybrid: BarcodeDetector + jsQR).
  // Stable identity: all mutable state lives in refs.
  const scanFrame = useCallback(async () => {
    if (!isMountedRef.current || !isScanningRef.current) return;
    const video = videoRef.current;

    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      if (isScanningRef.current) animFrameIdRef.current = requestAnimationFrame(scanLoopRef.current);
      return;
    }

    let detectedText: string | null = null;

    // 1. ENGINE 1: Native High-Performance Hardware BarcodeDetector
    //    (constructed once per stream, not per frame)
    try {
      if (!detectorRef.current) {
        const Ctor = getBarcodeDetectorCtor();
        if (Ctor) detectorRef.current = new Ctor({ formats: ['qr_code'] });
      }
      if (detectorRef.current) {
        const barcodes = await detectorRef.current.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          detectedText = barcodes[0].rawValue;
        }
      }
    } catch {
      // Fall through to jsQR engine
    }

    // 2. ENGINE 2: Enhanced jsQR with Dual-Inversion & Center-Crop
    if (!detectedText && canvasRef.current && !firedRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        canvas.width = vw;
        canvas.height = vh;
        ctx.drawImage(video, 0, 0, vw, vh);

        // Center Crop: Far faster & higher optical acuity on phone cameras
        const cropSize = Math.floor(Math.min(vw, vh) * 0.75);
        const cropX = Math.floor((vw - cropSize) / 2);
        const cropY = Math.floor((vh - cropSize) / 2);
        const cropData = ctx.getImageData(cropX, cropY, cropSize, cropSize);

        const cropResult = jsQR(cropData.data, cropSize, cropSize, {
          inversionAttempts: 'attemptBoth',
        });

        if (cropResult && cropResult.data && cropResult.data.trim().length > 0) {
          detectedText = cropResult.data.trim();
        } else {
          // Full Frame Fallback
          const fullData = ctx.getImageData(0, 0, vw, vh);
          const fullResult = jsQR(fullData.data, vw, vh, {
            inversionAttempts: 'attemptBoth',
          });
          if (fullResult && fullResult.data && fullResult.data.trim().length > 0) {
            detectedText = fullResult.data.trim();
          }
        }
      }
    }

    if (detectedText) {
      handleSuccess(detectedText);
      return;
    }

    if (isScanningRef.current && !firedRef.current) {
      animFrameIdRef.current = requestAnimationFrame(scanLoopRef.current);
    }
  }, [handleSuccess]);

  // Keep the loop ref pointing at the latest scanFrame identity.
  useEffect(() => {
    scanLoopRef.current = () => {
      void scanFrame();
    };
  }, [scanFrame]);

  // Start live camera stream. Depends only on stable callbacks + facingMode.
  const startCamera = useCallback(async () => {
    stopStream();
    setCameraError(null);
    setHasTorch(false);
    setTorchOn(false);
    setIsSuccess(false);
    setIsProcessingFile(false);
    firedRef.current = false;
    isScanningRef.current = true;
    setIsScanning(true);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError('Camera access requires HTTPS or is not supported by your browser.');
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Fallback without constraints for strict webcams / virtual cameras
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        const trk = track as unknown as { getCapabilities?: () => { torch?: boolean } };
        const capabilities = trk.getCapabilities?.();
        setHasTorch(Boolean(capabilities && 'torch' in capabilities));
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        try {
          await video.play();
        } catch {
          // play() can race with teardown (AbortError) — never report that
          // as a camera failure, and make sure the stream doesn't leak.
          if (!isScanningRef.current || !streamRef.current) {
            stopStream();
            return;
          }
        }
        if (isScanningRef.current && !firedRef.current) {
          animFrameIdRef.current = requestAnimationFrame(scanLoopRef.current);
        }
      }
    } catch (err: unknown) {
      console.warn('Camera stream failed:', err);
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow camera access in browser settings.');
      } else {
        setCameraError('Unable to access camera. Please check camera permissions or upload a photo.');
      }
    }
  }, [facingMode, stopStream]);

  // Modal lifecycle: open/close, focus management, Escape, modal-open counter
  // (the PanicButton ignores Escape while any modal is open).
  useEffect(() => {
    if (!isOpen) return;

    isMountedRef.current = true;
    firedRef.current = false;
    isScanningRef.current = true;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.dataset.vaultdropModalOpen = String(
      (Number(document.body.dataset.vaultdropModalOpen) || 0) + 1
    );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      isMountedRef.current = false;
      isScanningRef.current = false;
      clearSuccessTimer();
      stopStream();
      window.removeEventListener('keydown', handleKeyDown, true);
      const openCount = Number(document.body.dataset.vaultdropModalOpen || 1) - 1;
      if (openCount <= 0) delete document.body.dataset.vaultdropModalOpen;
      else document.body.dataset.vaultdropModalOpen = String(openCount);
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, stopStream, clearSuccessTimer]);

  // Camera start: keyed on facingMode only — parent re-renders can't restart
  // it. Deferred one tick so no state updates happen synchronously in the
  // effect body (and the cleanup can cancel a pending start).
  useEffect(() => {
    if (!isOpen) return;
    const startTimer = setTimeout(() => {
      void startCamera();
    }, 0);
    return () => clearTimeout(startTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, facingMode]);

  // Toggle Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const next = !torchOn;
        const trk = track as unknown as { applyConstraints: (c: Record<string, unknown>) => Promise<void> };
        await trk.applyConstraints({ advanced: [{ torch: next }] });
        setTorchOn(next);
      } catch (err) {
        console.warn('Torch toggle error:', err);
      }
    }
  };

  // Flip Camera
  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Decode from file/gallery upload fallback — every failure path clears the
  // spinner, and the input is reset so the same photo can be re-picked.
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file

    if (!file) return;
    if (firedRef.current) return;

    setIsProcessingFile(true);
    setCameraError(null);

    const finishWith = (message: string | null) => {
      if (!isMountedRef.current) return;
      setIsProcessingFile(false);
      if (message) setCameraError(message);
    };

    try {
      const reader = new FileReader();
      reader.onerror = () => finishWith('Failed to read the image file. Please try another photo.');
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => finishWith('This image could not be decoded. Please try another photo.');
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              finishWith('Failed to initialize image decoder context.');
              return;
            }

            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'attemptBoth',
            });

            if (code && code.data && code.data.trim().length > 0) {
              setIsProcessingFile(false);
              handleSuccess(code.data.trim());
            } else {
              finishWith('Could not find a valid QR code in this photo. Please try another angle.');
            }
          } catch {
            finishWith('Failed to process image file.');
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch {
      finishWith('Failed to process image file.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl border border-[#E5DCD4] shadow-apple-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[92vh]"
      >
        {/* Header */}
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
            aria-label="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder View */}
        <div className="relative bg-black flex-1 min-h-[300px] sm:min-h-[340px] flex items-center justify-center overflow-hidden">
          {/* HTML5 Live Video Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Apple Reticle Frame */}
          {!cameraError && (
            <div
              className={`relative z-10 w-60 h-60 sm:w-64 sm:h-64 border-2 rounded-3xl p-1 pointer-events-none flex items-center justify-center transition-all duration-300 ${
                isSuccess
                  ? 'border-emerald-500 bg-emerald-500/10 scale-105 shadow-[0_0_25px_#34C759]'
                  : 'border-white/30 shadow-2xl'
              }`}
            >
              {/* Corner Targets */}
              <div
                className={`absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 rounded-tl-xl transition-colors ${
                  isSuccess ? 'border-emerald-500' : 'border-[#0071E3]'
                }`}
              />
              <div
                className={`absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 rounded-tr-xl transition-colors ${
                  isSuccess ? 'border-emerald-500' : 'border-[#5856D6]'
                }`}
              />
              <div
                className={`absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 rounded-bl-xl transition-colors ${
                  isSuccess ? 'border-emerald-500' : 'border-[#AF52DE]'
                }`}
              />
              <div
                className={`absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 rounded-br-xl transition-colors ${
                  isSuccess ? 'border-emerald-500' : 'border-[#FF2D55]'
                }`}
              />

              {/* Laser Scan Animation */}
              {isScanning && (
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#0071E3] to-transparent animate-pulse shadow-[0_0_14px_#0071E3]" />
              )}

              {/* Success Badge */}
              {isSuccess && (
                <div className="flex flex-col items-center justify-center text-emerald-400 animate-in zoom-in duration-200">
                  <CheckCircle2 className="w-12 h-12" />
                  <span className="text-[12px] font-bold font-mono mt-1 text-white">QR Code Verified!</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Floating Camera Controls */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl backdrop-blur-md transition-all ${
                  torchOn ? 'bg-amber-400 text-black' : 'bg-black/40 text-white hover:bg-black/60'
                }`}
                title="Toggle Flashlight"
                aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                aria-pressed={torchOn}
              >
                {torchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={flipCamera}
              className="p-2 rounded-xl bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all tap-spring cursor-pointer"
              title="Switch Front / Back Camera"
              aria-label="Switch front or back camera"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          </div>

          {/* Error Message Card */}
          {cameraError && (
            <div className="z-20 p-5 bg-black/85 text-white max-w-xs text-center rounded-2xl mx-4 space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-[12px] sm:text-[13px] leading-relaxed text-zinc-300">{cameraError}</p>
              <button
                type="button"
                onClick={() => void startCamera()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[12px] font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-white border-t border-[#E5DCD4] space-y-3">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />

          <button
            type="button"
            disabled={isProcessingFile}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 px-3 bg-[#F8F3F0] hover:bg-[#E5DCD4] text-[#1A1A1A] text-[12px] sm:text-[13px] font-medium rounded-xl transition-all tap-spring cursor-pointer flex items-center justify-center gap-2 border border-[#E5DCD4]"
          >
            <Upload className="w-4 h-4 text-[#014BAA]" />
            <span>{isProcessingFile ? 'Analyzing Photo...' : 'Scan from Photo in Gallery'}</span>
          </button>

          <p className="text-[11px] text-center text-[#9B9B9B] font-mono">
            Point camera at the QR code on your PC monitor to log in instantly
          </p>
        </div>
      </div>
    </div>
  );
}
