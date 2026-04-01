import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// ── Open Food Facts lookup ───────────────────────────────────────────────────
// Returns { name, imageUrl } or null if the product isn't found.
async function lookupBarcode(barcode) {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const name =
      p.product_name ||
      p.product_name_en ||
      p.abbreviated_product_name ||
      null;

    // Prefer the small front-of-pack thumbnail; fall back through available sizes
    const imageUrl =
      p.image_front_small_url ||
      p.image_thumb_url ||
      p.image_small_url ||
      p.image_url ||
      null;

    return name ? { name, imageUrl } : null;
  } catch {
    return null;
  }
}

// ── Corner bracket SVG viewfinder ────────────────────────────────────────────
function Viewfinder() {
  const corner = 'w-7 h-7 border-white border-[2.5px]';
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <div className="relative w-64 h-36">
        <div className={`${corner} absolute top-0 left-0 border-r-0 border-b-0 rounded-tl-lg`} />
        <div className={`${corner} absolute top-0 right-0 border-l-0 border-b-0 rounded-tr-lg`} />
        <div className={`${corner} absolute bottom-0 left-0 border-r-0 border-t-0 rounded-bl-lg`} />
        <div className={`${corner} absolute bottom-0 right-0 border-l-0 border-t-0 rounded-br-lg`} />
      </div>
      <p className="text-white text-sm mt-5 opacity-75 tracking-wide">
        Align barcode within the frame
      </p>
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <div
        className="w-6 h-6 rounded-full border-2 animate-spin"
        style={{ borderColor: '#007AFF', borderTopColor: 'transparent' }}
      />
      <span className="text-gray-400 text-sm">Looking up product…</span>
    </div>
  );
}

// ── Result card (found / not-found) ─────────────────────────────────────────
function ResultCard({ phase, productName, productImageUrl, rawCode, onRescan, onConfirm }) {
  const isFound = phase === 'found';
  return (
    <div className="bg-gray-900 rounded-2xl p-5 w-full">
      <span
        className="text-xs font-bold uppercase tracking-widest"
        style={{ color: isFound ? '#30D158' : '#FF9F0A' }}
      >
        {isFound ? 'Product Found' : 'Not in Database'}
      </span>

      {isFound ? (
        <div className="flex items-center gap-3 mt-2 mb-4">
          {productImageUrl && (
            <img
              src={productImageUrl}
              alt={productName}
              className="w-14 h-14 rounded-xl object-contain bg-white shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <p className="text-white text-base font-semibold leading-snug">{productName}</p>
        </div>
      ) : (
        <>
          <p className="text-gray-400 text-sm mt-1">Code: {rawCode}</p>
          <p className="text-gray-600 text-xs mt-0.5 mb-4">
            You can still add it with a custom name.
          </p>
        </>
      )}

      <div className="flex gap-3">
        <button
          onClick={onRescan}
          className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-medium text-sm active:opacity-70"
        >
          Scan Again
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-3 rounded-xl text-white font-semibold text-sm active:opacity-80"
          style={{ backgroundColor: '#007AFF' }}
        >
          {isFound ? 'Add Item →' : 'Enter Manually'}
        </button>
      </div>
    </div>
  );
}

// ── Main scanner component ───────────────────────────────────────────────────
export default function ScannerComponent({ onSuccess, onClose }) {
  // phase: 'scanning' | 'loading' | 'found' | 'notfound'
  const [phase, setPhase] = useState('scanning');
  const [productName, setProductName] = useState('');
  const [productImageUrl, setProductImageUrl] = useState(null);
  const [rawCode, setRawCode] = useState('');

  const qrInstance = useRef(null);
  const processing = useRef(false);

  const startCamera = useCallback(async () => {
    processing.current = false;

    // Tear down any existing instance before creating a new one
    if (qrInstance.current) {
      try { await qrInstance.current.stop(); } catch { /* ignore */ }
      try { qrInstance.current.clear(); } catch { /* ignore */ }
      qrInstance.current = null;
    }

    const scanner = new Html5Qrcode('camera-feed');
    qrInstance.current = scanner;

    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        // qrbox is the scan region overlay drawn by html5-qrcode internally;
        // we draw our own viewfinder on top so this can stay invisible.
        qrbox: { width: 250, height: 150 },
        aspectRatio: window.innerWidth / window.innerHeight,
        disableFlip: false,
      },
      async (code) => {
        if (processing.current) return;
        processing.current = true;

        try { await scanner.stop(); } catch { /* ignore */ }

        setRawCode(code);
        setPhase('loading');

        const result = await lookupBarcode(code);
        setProductName(result?.name ?? '');
        setProductImageUrl(result?.imageUrl ?? null);
        setPhase(result ? 'found' : 'notfound');
      },
      () => { /* suppress per-frame decode errors */ }
    );
  }, []);

  useEffect(() => {
    startCamera().catch(console.error);
    return () => {
      qrInstance.current?.stop().catch(() => {});
    };
  }, [startCamera]);

  const handleRescan = () => {
    setPhase('scanning');
    setProductName('');
    setProductImageUrl(null);
    setRawCode('');
    startCamera().catch(console.error);
  };

  const handleConfirm = () => {
    // Pass { name, imageUrl } — App.jsx stores imageUrl on the item
    onSuccess({ name: productName, imageUrl: productImageUrl });
  };

  return (
    <div
      className="flex flex-col h-screen bg-black select-none"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
      }}
    >
      {/* ── Navigation bar ──────────────────────────────────────────────── */}
      <div
        className="relative flex items-center justify-center shrink-0 px-5 py-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <button
          onClick={onClose}
          className="absolute left-5 text-base font-medium active:opacity-50"
          style={{ color: '#007AFF' }}
          aria-label="Cancel scanner"
        >
          Cancel
        </button>
        <span className="text-white font-semibold text-base">Scan Barcode</span>
      </div>

      {/* ── Camera viewport ──────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {/*
          html5-qrcode mounts its <video> element here.
          position:absolute + inset-0 makes it fill the parent.
        */}
        <div id="camera-feed" className="absolute inset-0 w-full h-full" />

        {/* Our custom viewfinder sits on top */}
        {phase === 'scanning' && <Viewfinder />}
      </div>

      {/* ── Bottom panel ─────────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 py-5 flex flex-col items-stretch"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
          minHeight: 120,
        }}
      >
        {phase === 'scanning' && (
          <p className="text-center text-gray-600 text-sm">
            Supports EAN-13, UPC-A, QR codes
          </p>
        )}
        {phase === 'loading' && <Spinner />}
        {(phase === 'found' || phase === 'notfound') && (
          <ResultCard
            phase={phase}
            productName={productName}
            productImageUrl={productImageUrl}
            rawCode={rawCode}
            onRescan={handleRescan}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}
