import React, { useState, useRef, useCallback, useEffect } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────
const API_KEY_STORAGE = 'fridgetrack_claude_key';
const MODEL = 'claude-sonnet-4-6'; // vision + text, great quality/cost balance

// ── System prompt sent to Claude ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a food inventory parser for a fridge tracking app.

Given text, an image of a list/spreadsheet, or a photo of an actual fridge, extract all food items.

Return ONLY a raw JSON array — no markdown fences, no explanation, nothing else.

Each object shape:
{ "name": string, "expiryDate": string | null, "quantity": number, "category": string, "location": string }

Rules:
- name: keep brand names if present (e.g. "Oak Farms 2% Reduced Fat Milk")
- expiryDate: ISO 8601 YYYY-MM-DD. Convert partial dates: "04/16/26" → "2026-04-16", "07/2026" → "2026-07-31" (last day of month). If truly absent, use null.
- quantity: default 1 unless stated
- category: exactly one of "Proteins" | "Produce" | "Dairy" | "Beverages" | "Condiments" | "Leftovers" | "Snacks" | "Other"
- location: exactly one of "Fridge" | "Freezer" | "Pantry". Use "Freezer" for frozen items, "Pantry" for shelf-stable dry goods/canned goods/condiments, "Fridge" for everything else.
- For fridge photos: identify every visible food item, be thorough, look at all shelves and drawers
- For list/spreadsheet images: extract exactly what is written, preserve category groupings if visible
- For text: parse each line as an item, detect any dates mentioned inline`;

// ── Claude API call ───────────────────────────────────────────────────────────
async function callClaude(apiKey, mode, payload) {
  // mode: 'text' | 'list-image' | 'fridge-image'
  // payload: string for text, { base64, mimeType } for images

  let userContent;
  if (mode === 'text') {
    userContent = [
      { type: 'text', text: `Parse this food inventory:\n\n${payload}` },
    ];
  } else {
    userContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: payload.mimeType, data: payload.base64 },
      },
      {
        type: 'text',
        text:
          mode === 'fridge-image'
            ? 'This is a photo of a fridge. Identify every visible food item on every shelf and in every drawer.'
            : 'This is an image of a food list or inventory spreadsheet. Extract all items and their expiry dates.',
      },
    ];
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      // Required header for direct browser API access
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `API error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim() ?? '';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Claude occasionally wraps JSON in a fence despite the prompt; strip it
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = JSON.parse(match?.[1] ?? raw);
  }

  if (!Array.isArray(parsed)) throw new Error('Claude returned an unexpected format.');
  return parsed;
}

// ── File → base64 helper ──────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve({ base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Category badge colours (Apple system palette) ─────────────────────────────
const CAT_STYLE = {
  Proteins:    { bg: '#FFE5E5', color: '#FF3B30' },
  Produce:     { bg: '#E5F8EF', color: '#34C759' },
  Dairy:       { bg: '#E5F0FF', color: '#007AFF' },
  Beverages:   { bg: '#E5F8FF', color: '#32ADE6' },
  Condiments:  { bg: '#FFF3E5', color: '#FF9500' },
  Leftovers:   { bg: '#F3E5FF', color: '#AF52DE' },
  Snacks:      { bg: '#FFFBE5', color: '#FFCC00' },
  Other:       { bg: '#F2F2F7', color: '#8E8E93' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TabButton({ label, emoji, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
        active ? 'bg-white shadow-sm' : 'text-gray-400'
      }`}
      style={active ? { color: '#007AFF' } : {}}
    >
      <span className="text-xl leading-none">{emoji}</span>
      {label}
    </button>
  );
}

function ApiKeyPanel({ currentKey, onSave, onCancel }) {
  const [val, setVal] = useState(currentKey);
  return (
    <div className="mx-4 mb-3 p-4 bg-white rounded-2xl shadow-sm border border-orange-100">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
        Claude API Key
      </p>
      <input
        type="password"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="sk-ant-api03-…"
        className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-sm font-mono outline-none
                   focus:ring-2 focus:ring-[#007AFF]"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
        Stored locally on this device only. Get a key at{' '}
        <span className="underline" style={{ color: '#007AFF' }}>console.anthropic.com</span>
      </p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-[#F2F2F7] text-gray-600 text-sm font-medium active:opacity-70"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(val.trim())}
          disabled={!val.trim()}
          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 active:opacity-80"
          style={{ backgroundColor: '#007AFF' }}
        >
          Save Key
        </button>
      </div>
    </div>
  );
}

function ImageDropZone({ previewUrl, isCamera, onFileSelect, onClear }) {
  const inputRef = useRef(null);

  if (previewUrl) {
    return (
      <div className="relative rounded-2xl overflow-hidden bg-black">
        <img src={previewUrl} alt="Selected" className="w-full max-h-64 object-contain" />
        <button
          onClick={onClear}
          className="absolute top-2.5 right-2.5 w-7 h-7 bg-black/60 rounded-full
                     flex items-center justify-center text-white text-xs font-bold active:opacity-70"
          aria-label="Remove image"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={isCamera ? 'environment' : undefined}
        className="sr-only"
        onChange={(e) => onFileSelect(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full h-52 flex flex-col items-center justify-center gap-3 bg-white
                   rounded-2xl border-2 border-dashed border-gray-200 active:bg-gray-50 transition-colors"
      >
        <span className="text-5xl leading-none">{isCamera ? '📷' : '🖼️'}</span>
        <div className="text-center px-4">
          <p className="font-semibold text-gray-800 text-sm">
            {isCamera ? 'Take a Fridge Photo' : 'Choose a Photo'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {isCamera
              ? 'Claude will identify everything visible on every shelf'
              : 'Works with photos of handwritten lists, printed lists, or spreadsheets'}
          </p>
        </div>
        <span
          className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: '#007AFF' }}
        >
          {isCamera ? 'Open Camera' : 'Browse Photos'}
        </span>
      </button>
    </>
  );
}

function PreviewRow({ item, checked, onToggle }) {
  const style = CAT_STYLE[item.category] ?? CAT_STYLE.Other;
  const dateLabel = item.expiryDate
    ? new Date(item.expiryDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : 'No expiry date';

  return (
    <label className="flex items-center gap-3 py-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-5 h-5 rounded shrink-0"
        style={{ accentColor: '#007AFF' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {dateLabel}
          {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
        </p>
      </div>
      <span
        className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        {item.category}
      </span>
    </label>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export default function AIImportDrawer({ isOpen, onClose, onAdd }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [tab, setTab] = useState('text'); // 'text' | 'list-image' | 'fridge-image'
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [phase, setPhase] = useState('input'); // 'input' | 'loading' | 'preview'
  const [parsedItems, setParsedItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const reset = useCallback(() => {
    setText('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    setPhase('input');
    setParsedItems([]);
    setSelectedIds([]);
    setError('');
    setShowKeyPanel(false);
  }, [previewUrl]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem(API_KEY_STORAGE, key);
    setShowKeyPanel(false);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleClearImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
  };

  const handleAnalyze = async () => {
    if (!apiKey) { setShowKeyPanel(true); return; }
    setError('');
    setPhase('loading');

    try {
      let items;
      if (tab === 'text') {
        items = await callClaude(apiKey, 'text', text.trim());
      } else {
        const encoded = await fileToBase64(imageFile);
        items = await callClaude(apiKey, tab, encoded);
      }

      const VALID_LOCS = ['Fridge', 'Freezer', 'Pantry'];
      const normalized = items.map((item, i) => ({
        _id: `ai-${Date.now()}-${i}`,
        name: String(item.name ?? 'Unknown Item').trim(),
        expiryDate: item.expiryDate ?? null,
        quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
        category: CAT_STYLE[item.category] ? item.category : 'Other',
        location: VALID_LOCS.includes(item.location) ? item.location : 'Fridge',
        addedAt: new Date().toISOString(),
      }));

      setParsedItems(normalized);
      setSelectedIds(normalized.map((i) => i._id));
      setPhase('preview');
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Check your API key and try again.');
      setPhase('input');
    }
  };

  const toggleId = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleAll = () =>
    setSelectedIds(
      selectedIds.length === parsedItems.length ? [] : parsedItems.map((i) => i._id)
    );

  const handleConfirm = () => {
    parsedItems
      .filter((item) => selectedIds.includes(item._id))
      .forEach((item) => {
        onAdd({
          id:         `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name:       item.name,
          expiryDate: item.expiryDate,
          quantity:   item.quantity,
          category:   item.category,
          location:   item.location,
          addedAt:    item.addedAt,
        });
      });
    handleClose();
  };

  const canAnalyze = tab === 'text' ? text.trim().length > 0 : imageFile !== null;
  const selectedCount = selectedIds.length;

  const loadingMessages = {
    text: 'Parsing your list…',
    'list-image': 'Reading the list image…',
    'fridge-image': 'Scanning your fridge…',
  };

  return (
    <>
      {/* Scrim */}
      <div
        role="presentation"
        className="fixed inset-0 bg-black transition-opacity duration-300 z-40"
        style={{ opacity: isOpen ? 0.5 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Import"
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[2rem] shadow-2xl
                   flex flex-col transition-transform duration-300 ease-out"
        style={{
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          maxHeight: '92dvh',
          backgroundColor: '#F2F2F7',
          paddingBottom: 'env(safe-area-inset-bottom)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[5px] rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-1 pb-3 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              ✨ AI Import
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Paste a list, upload a photo, or snap your fridge
            </p>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={() => setShowKeyPanel((v) => !v)}
              className="p-1.5 rounded-xl text-gray-400 active:bg-gray-200 transition-colors"
              title="API key settings"
              aria-label="Configure Claude API key"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-xl text-gray-400 active:bg-gray-200 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* API Key panel (collapsible) */}
        {showKeyPanel && (
          <ApiKeyPanel
            currentKey={apiKey}
            onSave={saveApiKey}
            onCancel={() => setShowKeyPanel(false)}
          />
        )}

        {/* No-key warning */}
        {!apiKey && !showKeyPanel && phase === 'input' && (
          <button
            onClick={() => setShowKeyPanel(true)}
            className="mx-4 mb-3 px-4 py-3 rounded-xl text-left active:opacity-80"
            style={{ backgroundColor: '#FFF3E5', border: '1px solid #FFCC80' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#FF9500' }}>
              ⚠️ Claude API key required — tap to add
            </p>
          </button>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">

          {/* ── INPUT PHASE ── */}
          {phase === 'input' && (
            <>
              {/* Tab selector */}
              <div className="flex gap-1 bg-[#E5E5EA] rounded-xl p-1 mb-4">
                <TabButton
                  label="Paste Text"
                  emoji="📋"
                  active={tab === 'text'}
                  onClick={() => setTab('text')}
                />
                <TabButton
                  label="List Photo"
                  emoji="🖼️"
                  active={tab === 'list-image'}
                  onClick={() => setTab('list-image')}
                />
                <TabButton
                  label="Fridge Photo"
                  emoji="📷"
                  active={tab === 'fridge-image'}
                  onClick={() => setTab('fridge-image')}
                />
              </div>

              {/* Text input */}
              {tab === 'text' && (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    'Paste or type your list here…\n\n' +
                    'Examples:\n' +
                    '• Sliced Ham/Turkey - expires 04/16/26\n' +
                    '• Oak Farms 2% Milk\n' +
                    '• Colby Jack Cheese, exp 04/30/26\n' +
                    '• Cream Cheese 07/29/26\n\n' +
                    'Claude understands most formats.'
                  }
                  className="w-full h-56 px-4 py-3.5 bg-white rounded-2xl text-sm text-gray-800
                             placeholder-gray-300 outline-none focus:ring-2 focus:ring-[#007AFF]
                             resize-none leading-relaxed"
                />
              )}

              {/* Image / camera input */}
              {(tab === 'list-image' || tab === 'fridge-image') && (
                <ImageDropZone
                  previewUrl={previewUrl}
                  isCamera={tab === 'fridge-image'}
                  onFileSelect={handleFileSelect}
                  onClear={handleClearImage}
                />
              )}

              {/* Error */}
              {error && (
                <div className="mt-3 px-4 py-3 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-sm text-red-600 font-medium">⚠️ {error}</p>
                </div>
              )}

              {/* Analyze button */}
              <button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="w-full mt-4 py-4 rounded-2xl text-white font-bold text-base
                           disabled:opacity-35 active:opacity-80 transition-opacity"
                style={{ backgroundColor: '#007AFF' }}
              >
                Analyze with Claude ✨
              </button>
            </>
          )}

          {/* ── LOADING PHASE ── */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20 gap-5">
              <div
                className="w-14 h-14 rounded-full border-[3px] animate-spin"
                style={{ borderColor: '#007AFF', borderTopColor: 'transparent' }}
              />
              <div className="text-center">
                <p className="font-bold text-gray-800 text-base">{loadingMessages[tab]}</p>
                <p className="text-sm text-gray-400 mt-1">
                  Claude is reading your{' '}
                  {tab === 'fridge-image' ? 'fridge' : tab === 'list-image' ? 'image' : 'list'}
                </p>
              </div>
            </div>
          )}

          {/* ── PREVIEW PHASE ── */}
          {phase === 'preview' && (
            <>
              {/* Summary row */}
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-gray-900">
                  {parsedItems.length} item{parsedItems.length !== 1 ? 's' : ''} found
                </p>
                <button
                  className="text-sm font-semibold active:opacity-60"
                  style={{ color: '#007AFF' }}
                  onClick={toggleAll}
                >
                  {selectedIds.length === parsedItems.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Item list */}
              <div className="bg-white rounded-2xl divide-y divide-gray-100 px-4">
                {parsedItems.map((item) => (
                  <PreviewRow
                    key={item._id}
                    item={item}
                    checked={selectedIds.includes(item._id)}
                    onToggle={() => toggleId(item._id)}
                  />
                ))}
              </div>

              {/* Items without expiry date note */}
              {parsedItems.some((i) => !i.expiryDate) && (
                <p className="text-xs text-gray-400 mt-2 px-1">
                  * Items without a date will show "No date" in your list — you can edit them later.
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setPhase('input')}
                  className="flex-1 py-3.5 rounded-2xl bg-white text-gray-700 font-semibold
                             text-sm active:opacity-70 shadow-sm"
                >
                  ← Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedCount === 0}
                  className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm
                             disabled:opacity-40 active:opacity-80 transition-opacity"
                  style={{ backgroundColor: '#007AFF' }}
                >
                  Add {selectedCount} Item{selectedCount !== 1 ? 's' : ''} →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
