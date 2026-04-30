import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, HOUSEHOLD_ID, rowToRecipe, recipeToRow } from './supabase';
import { useApiKey } from './ApiKeyContext';

const IOS_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif';

const MODEL = 'claude-sonnet-4-6';
const TAB_BAR_H = 56;

const STORES = [
  { id: 'target', label: 'Target', icon: '🎯', color: '#CC0000' },
  { id: 'heb',    label: 'H-E-B',  icon: '🛒', color: '#E31837' },
  { id: 'costco', label: 'Costco', icon: '🏪', color: '#005DAA' },
];

// ── Amount helpers ─────────────────────────────────────────────────────────────
function scaleAmount(amount, batches) {
  return Math.round(amount * batches * 100) / 100;
}

function formatAmount(amount) {
  if (!amount && amount !== 0) return '';
  if (amount === 0) return '';
  const whole   = Math.floor(amount);
  const decimal = Math.round((amount - whole) * 100) / 100;
  const fracs   = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔', 0.13: '⅛' };
  const frac    = fracs[decimal] ?? null;
  if (frac)  return whole > 0 ? `${whole} ${frac}` : frac;
  return String(amount);
}

// ── SearchBar ─────────────────────────────────────────────────────────────────
function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 bg-[#E5E5EA] rounded-xl px-3 py-2.5">
      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
      />
      {value && (
        <button onClick={() => onChange('')} className="text-gray-400 active:text-gray-600">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Recipe Card with swipe ────────────────────────────────────────────────────
const ADD_W = 90;
const DEL_W = 80;

function RecipeCard({ recipe, onSwipeAdd, onDelete, onTap }) {
  const [cardX,   setCardX]   = useState(0);
  const [snapped, setSnapped] = useState(null);
  const touchStartX  = useRef(null);
  const wasDragging  = useRef(false);

  const onTouchStart = e => {
    touchStartX.current = e.touches[0].clientX;
    wasDragging.current = false;
  };
  const onTouchMove = e => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 5) wasDragging.current = true;
    setCardX(Math.max(-DEL_W, Math.min(ADD_W, dx)));
  };
  const onTouchEnd = () => {
    if      (cardX >= ADD_W * 0.55)   { setCardX(ADD_W);  setSnapped('add'); }
    else if (cardX <= -DEL_W * 0.55)  { setCardX(-DEL_W); setSnapped('delete'); }
    else                              { setCardX(0);       setSnapped(null); }
    touchStartX.current = null;
  };
  const close = () => { setCardX(0); setSnapped(null); };

  const handleClick = () => {
    if (wasDragging.current) { wasDragging.current = false; return; }
    if (snapped) { close(); return; }
    onTap(recipe);
  };

  return (
    <div className="relative rounded-2xl overflow-hidden mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      {/* Green add panel — swipe right */}
      <div
        className="absolute left-0 inset-y-0 flex items-center justify-center rounded-l-2xl"
        style={{ width: ADD_W, backgroundColor: '#34C759' }}
      >
        <button
          onClick={() => { close(); onSwipeAdd(recipe); }}
          className="w-full h-full flex flex-col items-center justify-center gap-1 active:opacity-70"
          aria-label={`Add ${recipe.name} to grocery`}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-white text-xs font-bold">Add to List</span>
        </button>
      </div>

      {/* Red delete panel — swipe left */}
      <div
        className="absolute right-0 inset-y-0 flex items-center justify-center rounded-r-2xl"
        style={{ width: DEL_W, backgroundColor: '#FF3B30' }}
      >
        <button
          onClick={() => onDelete(recipe.id)}
          className="w-full h-full flex flex-col items-center justify-center gap-1 active:opacity-70"
          aria-label={`Delete ${recipe.name}`}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-white text-xs font-bold">Delete</span>
        </button>
      </div>

      {/* Card face */}
      <div
        className="bg-white relative"
        style={{
          transform:  `translateX(${cardX}px)`,
          transition: (cardX === 0 || snapped) ? 'transform 0.22s ease' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleClick}
      >
        <div className="flex items-start gap-3 px-4 py-4">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt={recipe.name}
              className="w-16 h-16 rounded-xl object-cover shrink-0"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 text-3xl select-none"
              style={{ backgroundColor: '#F2F2F7' }}
            >
              📖
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-snug">{recipe.name}</p>
            {recipe.description && (
              <p className="text-sm text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{recipe.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F2F2F7', color: '#8E8E93' }}>
                {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F2F2F7', color: '#8E8E93' }}>
                Serves {recipe.servingsBase}
              </span>
            </div>
          </div>
          <svg className="w-4 h-4 text-gray-300 shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Ingredient Selection Modal ────────────────────────────────────────────────
function IngredientModal({ isOpen, onClose, recipe, batches, onConfirm }) {
  const [selected, setSelected] = useState(new Set());
  const [store,    setStore]    = useState('heb');

  useEffect(() => {
    if (isOpen && recipe) {
      setSelected(new Set(recipe.ingredients.map((_, i) => i)));
    }
  }, [isOpen, recipe]);

  if (!recipe) return null;

  const allSelected = selected.size === recipe.ingredients.length;
  const toggleAll   = () => setSelected(allSelected
    ? new Set()
    : new Set(recipe.ingredients.map((_, i) => i))
  );
  const toggle = i => setSelected(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const handleConfirm = () => {
    const items = [...selected].sort((a, b) => a - b).map(i => {
      const ing    = recipe.ingredients[i];
      const scaled = scaleAmount(ing.amount, batches);
      const amt    = scaled ? `${formatAmount(scaled)}${ing.unit ? ` ${ing.unit}` : ''}` : '';
      return amt ? `${ing.name} (${amt})` : ing.name;
    });
    onConfirm(items, store);
    onClose();
  };

  const activeStore = STORES.find(s => s.id === store) ?? STORES[0];

  return (
    <>
      <div
        className="fixed inset-0 bg-black transition-opacity duration-300 z-50"
        style={{ opacity: isOpen ? 0.5 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-[2rem] shadow-2xl
                   transition-transform duration-300 ease-out flex flex-col"
        style={{
          transform:  isOpen ? 'translateY(0)' : 'translateY(100%)',
          maxHeight:  '88vh',
          paddingBottom: 'env(safe-area-inset-bottom)',
          fontFamily: IOS_FONT,
        }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[5px] rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pt-2 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Add to Grocery</h2>
            <button
              onClick={toggleAll}
              className="text-sm font-semibold px-3 py-1.5 rounded-xl active:opacity-60"
              style={{ backgroundColor: '#F2F2F7', color: '#007AFF' }}
            >
              {allSelected ? 'Unselect All' : 'Select All'}
            </button>
          </div>

          {/* Store picker */}
          <div className="flex gap-1 bg-[#E5E5EA] rounded-xl p-1 mb-4">
            {STORES.map(s => {
              const active = store === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStore(s.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all active:opacity-80"
                  style={active
                    ? { backgroundColor: '#fff', color: s.color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                    : { color: '#8E8E93' }}
                >
                  <span>{s.icon}</span>{s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ingredient list */}
        <div className="overflow-y-auto flex-1 px-5 mb-4">
          <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            {recipe.ingredients.map((ing, i) => {
              const scaled    = scaleAmount(ing.amount, batches);
              const amountStr = scaled ? `${formatAmount(scaled)}${ing.unit ? ` ${ing.unit}` : ''}` : '';
              const checked   = selected.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors
                    ${i < recipe.ingredients.length - 1 ? 'border-b border-gray-100' : ''}`}
                  style={{ backgroundColor: checked ? '#F0FBF4' : '#fff' }}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all`}
                    style={checked
                      ? { backgroundColor: '#34C759', borderColor: '#34C759' }
                      : { borderColor: '#D1D5DB', backgroundColor: 'transparent' }}
                  >
                    {checked && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`flex-1 text-base ${checked ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                    {ing.name}
                  </span>
                  {amountStr && (
                    <span className="text-sm text-gray-400 shrink-0">{amountStr}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 pb-4 shrink-0">
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="w-full py-4 rounded-2xl text-white text-base font-bold active:opacity-80 disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: activeStore.color }}
          >
            Add {selected.size} Item{selected.size !== 1 ? 's' : ''} to {activeStore.label} {activeStore.icon}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Recipe Detail View ────────────────────────────────────────────────────────
function RecipeDetail({ recipe, onClose, onAddToGrocery }) {
  const [batches, setBatches] = useState(1);

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: IOS_FONT }}>
      {/* Header */}
      <header className="px-4 pt-5 pb-3 shrink-0 flex items-center gap-3">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-60 shrink-0"
          aria-label="Back"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900 flex-1 leading-tight">{recipe.name}</h1>
      </header>

      <div
        className="flex-1 overflow-y-auto px-5"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px + 80px)` }}
      >
        {recipe.imageUrl && (
          <img
            src={recipe.imageUrl}
            alt={recipe.name}
            className="w-full h-48 object-cover rounded-2xl mb-5"
          />
        )}

        {recipe.description && (
          <p className="text-base text-gray-500 mb-5 leading-relaxed">{recipe.description}</p>
        )}

        {/* Batches control */}
        <div
          className="bg-white rounded-2xl p-4 mb-5 flex items-center justify-between"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <div>
            <p className="text-sm font-bold text-gray-900">Batches</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {recipe.servingsBase} serving{recipe.servingsBase !== 1 ? 's' : ''} per batch
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setBatches(b => Math.max(0.5, Math.round((b - 0.5) * 10) / 10))}
              className="w-10 h-10 rounded-xl bg-[#F2F2F7] text-xl font-bold text-gray-600 flex items-center justify-center active:opacity-60"
            >−</button>
            <span className="text-lg font-bold text-gray-900 w-8 text-center">{batches}</span>
            <button
              onClick={() => setBatches(b => Math.round((b + 0.5) * 10) / 10)}
              className="w-10 h-10 rounded-xl bg-[#F2F2F7] text-xl font-bold text-gray-600 flex items-center justify-center active:opacity-60"
            >+</button>
          </div>
        </div>

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <section className="mb-5">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Ingredients
            </h2>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              {recipe.ingredients.map((ing, i) => {
                const scaled    = scaleAmount(ing.amount, batches);
                const amountStr = scaled ? `${formatAmount(scaled)}${ing.unit ? ` ${ing.unit}` : ''}` : '';
                return (
                  <div
                    key={i}
                    className={`flex items-center px-4 py-3.5 gap-3 ${i < recipe.ingredients.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#34C759' }} />
                    <p className="flex-1 text-base text-gray-900 font-medium">{ing.name}</p>
                    {amountStr && (
                      <p className="text-sm text-gray-500 font-semibold shrink-0">{amountStr}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Instructions */}
        {recipe.instructions.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Instructions
            </h2>
            <div className="space-y-3">
              {recipe.instructions.map((step, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl px-4 py-3.5 flex gap-3"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                >
                  <span
                    className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: '#34C759' }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-base text-gray-900 leading-relaxed flex-1">{step}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Add to Grocery button */}
      <nav
        className="fixed left-0 right-0 px-4 z-20"
        style={{
          bottom:        `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px)`,
          paddingTop:    12,
          paddingBottom: 8,
          background:    'linear-gradient(to top, #F2F2F7 55%, transparent)',
        }}
      >
        <button
          onClick={() => onAddToGrocery(recipe, batches)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-semibold text-sm active:opacity-80 transition-opacity"
          style={{ backgroundColor: '#34C759' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Add Ingredients to Grocery
        </button>
      </nav>
    </div>
  );
}

// ── AI Recipe Import ──────────────────────────────────────────────────────────
const RECIPE_SYSTEM_PROMPT = `You are a recipe parser. Extract the recipe from the provided text or image.

Return ONLY raw JSON (no markdown fences, no explanation) in this exact format:
{
  "name": string,
  "description": string | null,
  "servings_base": number,
  "ingredients": [{ "name": string, "amount": number, "unit": string }],
  "instructions": [string]
}

Rules:
- name: the recipe name
- description: 1-2 sentence summary, or null
- servings_base: number of servings as written (default 4 if not stated)
- ingredients: each as a separate object. amount as a decimal number (e.g. 2.5 for "2½ cups"). unit as a string ("cups", "tbsp", "oz", "g", "cloves", etc.) or "" if no unit
- instructions: array of step strings WITHOUT step numbers`;

async function callClaudeRecipe(apiKey, mode, payload) {
  let userContent;
  if (mode === 'text') {
    userContent = [{ type: 'text', text: `Parse this recipe:\n\n${payload}` }];
  } else {
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: payload.mimeType, data: payload.base64 } },
      { type: 'text', text: 'Extract the complete recipe from this image.' },
    ];
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':    apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 4096,
      system:     RECIPE_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `API error ${res.status}`);
  }

  const data = await res.json();
  const raw  = data.content?.[0]?.text?.trim() ?? '';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = JSON.parse(match?.[1] ?? raw);
  }

  return parsed;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64: reader.result.split(',')[1], mimeType: file.type || 'image/jpeg' });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AIRecipeImport({ isOpen, onClose, onImport }) {
  const { apiKey, saveApiKey } = useApiKey();
  const [mode,    setMode]    = useState('text'); // 'text' | 'image'
  const [text,    setText]    = useState('');
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [phase,   setPhase]   = useState('idle'); // idle | loading | error
  const [error,   setError]   = useState('');
  const fileRef = useRef(null);

  const hasKey = !!apiKey;

  const handleFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  };

  const handleAnalyze = async () => {
    setPhase('loading');
    setError('');
    try {
      let parsed;
      if (mode === 'text') {
        if (!text.trim()) { setError('Paste a recipe first.'); setPhase('error'); return; }
        parsed = await callClaudeRecipe(apiKey, 'text', text);
      } else {
        if (!imgFile) { setError('Select an image first.'); setPhase('error'); return; }
        const b64 = await fileToBase64(imgFile);
        parsed = await callClaudeRecipe(apiKey, 'image', b64);
      }

      const recipe = {
        id:           `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name:         parsed.name ?? 'Untitled Recipe',
        description:  parsed.description ?? null,
        servingsBase: parsed.servings_base ?? 4,
        ingredients:  (parsed.ingredients ?? []).map(ing => ({
          name:   ing.name ?? '',
          amount: Number(ing.amount) || 0,
          unit:   ing.unit ?? '',
        })),
        instructions: parsed.instructions ?? [],
        imageUrl:     null,
        addedAt:      new Date().toISOString(),
      };

      onImport(recipe);
      setText(''); setImgFile(null); setImgPreview(null);
      setPhase('idle');
      onClose();
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black transition-opacity duration-300 z-40"
        style={{ opacity: isOpen ? 0.4 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[2rem] shadow-2xl
                   transition-transform duration-300 ease-out flex flex-col"
        style={{
          transform:  isOpen ? 'translateY(0)' : 'translateY(100%)',
          maxHeight:  '90vh',
          paddingBottom: 'env(safe-area-inset-bottom)',
          fontFamily: IOS_FONT,
        }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[5px] rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pt-2 pb-2 shrink-0 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">✨ AI Recipe Import</h2>
          <button onClick={onClose} className="text-gray-400 active:text-gray-600 p-1" aria-label="Close">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-4">
          {/* API key missing */}
          {!hasKey && (
            <div className="bg-[#FFF3E5] rounded-2xl p-4 mb-4" style={{ border: '1px solid #FFCC80' }}>
              <p className="text-sm font-semibold" style={{ color: '#FF9500' }}>
                ⚙️ Claude API key required
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Set your key in Settings (⚙️ icon on the Inventory tab) to use AI recipe import.
              </p>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex gap-1 bg-[#E5E5EA] rounded-xl p-1 mb-4">
            {[{ id: 'text', label: 'Paste Text', icon: '📝' }, { id: 'image', label: 'Upload Image', icon: '📷' }].map(m => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={active
                    ? { backgroundColor: '#fff', color: '#34C759', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                    : { color: '#8E8E93' }}
                >
                  <span>{m.icon}</span>{m.label}
                </button>
              );
            })}
          </div>

          {/* Input area */}
          {mode === 'text' ? (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste your recipe here — ingredients, instructions, everything…"
              rows={8}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none resize-none"
            />
          ) : (
            <div>
              <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} className="hidden" />
              {imgPreview ? (
                <div className="relative">
                  <img src={imgPreview} alt="Recipe" className="w-full rounded-2xl object-cover max-h-64" />
                  <button
                    onClick={() => { setImgFile(null); setImgPreview(null); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center text-xs active:opacity-70"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-40 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 active:opacity-70 text-gray-400"
                >
                  <span className="text-4xl">📷</span>
                  <p className="text-sm font-medium">Tap to select recipe image</p>
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 mt-3 px-1">{error}</p>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!hasKey || phase === 'loading'}
            className="w-full py-4 rounded-2xl text-white text-base font-bold mt-4 active:opacity-80 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
            style={{ backgroundColor: '#34C759' }}
          >
            {phase === 'loading' ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Parsing Recipe…
              </>
            ) : '✨ Import Recipe'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Recipes Tab ──────────────────────────────────────────────────────────
export default function RecipesTab() {
  const [recipes,      setRecipes]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [detailRecipe, setDetailRecipe] = useState(null); // viewing detail
  const [modalRecipe,  setModalRecipe]  = useState(null); // ingredient modal
  const [modalBatches, setModalBatches] = useState(1);
  const [importOpen,   setImportOpen]   = useState(false);

  useEffect(() => {
    supabase
      .from('recipes')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .order('added_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setRecipes(data.map(rowToRecipe));
        setLoading(false);
      });

    const channel = supabase
      .channel('recipes-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recipes',
          filter: `household_id=eq.${HOUSEHOLD_ID}` },
        ({ eventType, new: row, old }) => {
          setRecipes(prev => {
            if (eventType === 'INSERT')
              return prev.some(r => r.id === row.id) ? prev : [rowToRecipe(row), ...prev];
            if (eventType === 'DELETE')
              return prev.filter(r => r.id !== old.id);
            if (eventType === 'UPDATE')
              return prev.map(r => r.id === row.id ? rowToRecipe(row) : r);
            return prev;
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleDelete = async (id) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase
      .from('recipes').delete().eq('id', id).eq('household_id', HOUSEHOLD_ID);
    if (error) console.error('Delete recipe failed:', error.message);
  };

  const handleImport = async (recipe) => {
    setRecipes(prev => [recipe, ...prev]);
    const { error } = await supabase.from('recipes').insert(recipeToRow(recipe));
    if (error) {
      console.error('Import recipe failed:', error.message);
      setRecipes(prev => prev.filter(r => r.id !== recipe.id));
    }
  };

  // Called from swipe or detail view "Add to Grocery"
  const openIngredientModal = (recipe, batches = 1) => {
    setModalRecipe(recipe);
    setModalBatches(batches);
  };

  const handleConfirmGrocery = async (items, storeId) => {
    for (const name of items) {
      const newItem = {
        id:           `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        household_id: HOUSEHOLD_ID,
        store_id:     storeId,
        name,
        checked:      false,
        added_at:     new Date().toISOString(),
      };
      await supabase.from('grocery_items').insert(newItem);
    }
  };

  const filtered = search.trim()
    ? recipes.filter(r => r.name.toLowerCase().includes(search.trim().toLowerCase()))
    : recipes;

  // ── Detail view ──
  if (detailRecipe) {
    return (
      <>
        <RecipeDetail
          recipe={detailRecipe}
          onClose={() => setDetailRecipe(null)}
          onAddToGrocery={(recipe, batches) => openIngredientModal(recipe, batches)}
        />
        <IngredientModal
          isOpen={!!modalRecipe}
          onClose={() => setModalRecipe(null)}
          recipe={modalRecipe}
          batches={modalBatches}
          onConfirm={handleConfirmGrocery}
        />
      </>
    );
  }

  // ── List view ──
  return (
    <div className="flex flex-col h-full" style={{ fontFamily: IOS_FONT }}>
      {/* Header */}
      <header className="px-5 pt-5 pb-3 shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-[2rem] font-bold tracking-tight text-gray-900 leading-none">Recipes</h1>
          <p className="text-sm text-gray-400 mt-1">
            {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-xl active:opacity-70 transition-opacity"
          style={{ backgroundColor: '#EDFBF1', color: '#34C759' }}
          aria-label="AI Import"
        >
          <span className="text-base leading-none">✨</span>
          <span className="text-sm font-semibold">AI Import</span>
        </button>
      </header>

      {/* Search */}
      <div className="px-4 pb-3 shrink-0">
        <SearchBar value={search} onChange={setSearch} placeholder="Search recipes…" />
      </div>

      {/* Swipe hint */}
      {recipes.length > 0 && (
        <p className="text-xs text-gray-400 text-center pb-2 shrink-0">
          Swipe right to add to grocery · Swipe left to delete
        </p>
      )}

      {/* Recipe list */}
      <div
        className="flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px + 20px)` }}
      >
        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="w-8 h-8 rounded-full border-[3px] animate-spin" style={{ borderColor: '#34C759', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center px-8">
            <div className="text-7xl mb-5 select-none">📖</div>
            <p className="text-xl font-bold text-gray-700">{search ? 'No results' : 'No recipes yet'}</p>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              {search ? 'Try a different search.' : 'Tap ✨ AI Import to add your first recipe.'}
            </p>
          </div>
        ) : (
          filtered.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onSwipeAdd={r => openIngredientModal(r, 1)}
              onDelete={handleDelete}
              onTap={setDetailRecipe}
            />
          ))
        )}
      </div>

      {/* Ingredient selection modal */}
      <IngredientModal
        isOpen={!!modalRecipe}
        onClose={() => setModalRecipe(null)}
        recipe={modalRecipe}
        batches={modalBatches}
        onConfirm={handleConfirmGrocery}
      />

      {/* AI import sheet */}
      <AIRecipeImport
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  );
}
