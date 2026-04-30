import React, { useState, useEffect, useCallback, useRef } from 'react';
import ScannerComponent from './ScannerComponent';
import AIImportDrawer from './AIImportDrawer';
import GroceryList from './GroceryList';
import PlannedMeals from './PlannedMeals';
import RecipesTab from './RecipesTab';
import ChatbotTab from './ChatbotTab';
import { ApiKeyProvider, useApiKey } from './ApiKeyContext';
import { getItemEmoji, getItemCategory, getDefaultLocation } from './itemIcon';
import { supabase, HOUSEHOLD_ID, rowToItem, itemToRow } from './supabase';

// ── Constants ────────────────────────────────────────────────────────────────
const NOTIF_KEY = 'fridgetrack_notified_date';

const IOS_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif';

const LOCATIONS = ['Fridge', 'Freezer', 'Pantry'];

const LOCATION_META = {
  Fridge:  { icon: '🧊', color: '#007AFF', emptyIcon: '🧊', emptyMsg: "Your fridge is empty"  },
  Freezer: { icon: '❄️', color: '#32ADE6', emptyIcon: '❄️', emptyMsg: "Your freezer is empty" },
  Pantry:  { icon: '🥫', color: '#FF9500', emptyIcon: '🥫', emptyMsg: "Your pantry is empty"  },
};

const CATEGORY_ORDER = [
  'Proteins', 'Produce', 'Dairy', 'Beverages',
  'Condiments', 'Snacks', 'Leftovers', 'Other',
];

const CATEGORY_ICONS = {
  Proteins: '🥩', Produce: '🥬', Dairy: '🧀', Beverages: '🥤',
  Condiments: '🫙', Snacks: '🍿', Leftovers: '🍱', Other: '🍽️',
};

// ── Expiry utilities ─────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / 86_400_000);
}

function expiryBadge(days) {
  if (days === null) return { label: 'No Date', bg: '#F2F2F7', color: '#8E8E93' };
  if (days < 0)      return { label: 'Expired', bg: '#FFE5E5', color: '#FF3B30' };
  if (days === 0)    return { label: 'Today',   bg: '#FFF3E5', color: '#FF9500' };
  if (days <= 3)     return { label: `${days}d`, bg: '#FFF3E5', color: '#FF9500' };
  if (days <= 7)     return { label: `${days}d`, bg: '#FFFBE5', color: '#FFCC00' };
  return                    { label: `${days}d`, bg: '#E5F8EF', color: '#34C759' };
}

function formatDate(dateStr) {
  if (!dateStr) return 'No date set';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Group items by category in canonical order ───────────────────────────────
function groupByCategory(items) {
  const map = {};
  items.forEach(item => {
    const cat = item.category || getItemCategory(item.name) || 'Other';
    if (!map[cat]) map[cat] = [];
    map[cat].push(item);
  });
  return CATEGORY_ORDER
    .filter(cat => map[cat]?.length)
    .map(cat => ({ category: cat, items: map[cat] }));
}

// ── Notification helpers ─────────────────────────────────────────────────────
async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied')  return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function sendExpiryNotifications(items) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = new Date().toDateString();
  if (localStorage.getItem(NOTIF_KEY) === today) return; // already notified today

  const expired = items.filter(i => { const d = daysUntil(i.expiryDate); return d !== null && d < 0; });
  const soon    = items.filter(i => { const d = daysUntil(i.expiryDate); return d !== null && d >= 0 && d <= 2; });

  if (expired.length > 0) {
    new Notification('🚨 Items Expired — FridgeTrack', {
      body: expired.slice(0, 3).map(i => i.name).join(', ') +
            (expired.length > 3 ? ` +${expired.length - 3} more` : ''),
      icon: '/icons/icon-192.png',
      tag:  'fridgetrack-expired',
    });
  }
  if (soon.length > 0) {
    new Notification('⚠️ Expiring Soon — FridgeTrack', {
      body: soon.slice(0, 3)
            .map(i => `${i.name} (${daysUntil(i.expiryDate) === 0 ? 'today' : daysUntil(i.expiryDate) + 'd'})`)
            .join(', '),
      icon: '/icons/icon-192.png',
      tag:  'fridgetrack-soon',
    });
  }
  if (expired.length || soon.length) localStorage.setItem(NOTIF_KEY, today);
}

// ── AlertBanner ───────────────────────────────────────────────────────────────
function AlertBanner({ items }) {
  const [dismissed, setDismissed] = useState(false);

  const expired = items.filter(i => { const d = daysUntil(i.expiryDate); return d !== null && d < 0; });
  const soon    = items.filter(i => { const d = daysUntil(i.expiryDate); return d !== null && d >= 0 && d <= 2; });

  if (dismissed || (!expired.length && !soon.length)) return null;

  return (
    <div className="mx-4 mb-3 rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(255,59,48,0.12)' }}>
      {expired.length > 0 && (
        <div className="px-4 py-3 flex items-start gap-3" style={{ backgroundColor: '#FFE5E5' }}>
          <span className="text-lg leading-none mt-0.5 shrink-0">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: '#FF3B30' }}>
              {expired.length} item{expired.length > 1 ? 's' : ''} expired
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#C0392B' }}>
              {expired.slice(0, 3).map(i => i.name).join(', ')}
              {expired.length > 3 ? ` +${expired.length - 3} more` : ''}
            </p>
          </div>
          {!soon.length && (
            <button onClick={() => setDismissed(true)} className="text-red-300 active:text-red-500 ml-1 shrink-0">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
              </svg>
            </button>
          )}
        </div>
      )}
      {soon.length > 0 && (
        <div className="px-4 py-3 flex items-start gap-3" style={{ backgroundColor: '#FFF3E5' }}>
          <span className="text-lg leading-none mt-0.5 shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: '#FF9500' }}>
              {soon.length} item{soon.length > 1 ? 's' : ''} expiring in 1–2 days
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#D4800A' }}>
              {soon.slice(0, 3).map(i => i.name).join(', ')}
              {soon.length > 3 ? ` +${soon.length - 3} more` : ''}
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="text-orange-300 active:text-orange-500 ml-1 shrink-0">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── LocationTabs ──────────────────────────────────────────────────────────────
function LocationTabs({ selected, onChange }) {
  return (
    <div className="flex gap-1 mx-4 mb-3 bg-[#E5E5EA] rounded-xl p-1">
      {LOCATIONS.map(loc => {
        const meta   = LOCATION_META[loc];
        const active = selected === loc;
        return (
          <button
            key={loc}
            onClick={() => onChange(loc)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all active:opacity-80"
            style={active
              ? { backgroundColor: '#fff', color: meta.color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { color: '#8E8E93' }}
          >
            <span className="text-base leading-none">{meta.icon}</span>
            {loc}
          </button>
        );
      })}
    </div>
  );
}

// ── CategoryHeader ────────────────────────────────────────────────────────────
function CategoryHeader({ title }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-5 pb-2">
      <span className="text-sm leading-none">{CATEGORY_ICONS[title] ?? '🍽️'}</span>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</p>
    </div>
  );
}

// ── ItemCard with swipe-to-delete and swipe-to-edit ──────────────────────────
const DELETE_WIDTH = 80;
const EDIT_WIDTH   = 80;

function ItemCard({ item, onDelete, onEdit }) {
  const days     = daysUntil(item.expiryDate);
  const badge    = expiryBadge(days);
  const emoji    = getItemEmoji(item.name, item.category);
  const [imgError, setImgError] = useState(false);
  const showImage = item.imageUrl && !imgError;

  // cardX > 0 = swiped right (edit), cardX < 0 = swiped left (delete)
  const [cardX,   setCardX]   = useState(0);
  const [snapped, setSnapped] = useState(null); // null | 'edit' | 'delete'
  const touchStartX = useRef(null);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    setCardX(Math.max(-DELETE_WIDTH, Math.min(EDIT_WIDTH, dx)));
  };
  const onTouchEnd = () => {
    if (cardX >= EDIT_WIDTH * 0.55)      { setCardX(EDIT_WIDTH);   setSnapped('edit'); }
    else if (cardX <= -DELETE_WIDTH * 0.55) { setCardX(-DELETE_WIDTH); setSnapped('delete'); }
    else                                 { setCardX(0);            setSnapped(null); }
    touchStartX.current = null;
  };
  const closeSwipe = () => { setCardX(0); setSnapped(null); };

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      {/* Green edit panel — revealed on right swipe */}
      <div
        className="absolute left-0 inset-y-0 flex items-center justify-center rounded-l-2xl"
        style={{ width: EDIT_WIDTH, backgroundColor: '#34C759' }}
      >
        <button
          onClick={() => { closeSwipe(); onEdit(item); }}
          className="w-full h-full flex flex-col items-center justify-center gap-1 active:opacity-70"
          aria-label={`Edit ${item.name}`}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-white text-xs font-bold">Edit</span>
        </button>
      </div>

      {/* Red delete panel — revealed on left swipe */}
      <div
        className="absolute right-0 inset-y-0 flex items-center justify-center rounded-r-2xl"
        style={{ width: DELETE_WIDTH, backgroundColor: '#FF3B30' }}
      >
        <button
          onClick={() => onDelete(item.id)}
          className="w-full h-full flex flex-col items-center justify-center gap-1 active:opacity-70"
          aria-label={`Delete ${item.name}`}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-white text-xs font-bold">Delete</span>
        </button>
      </div>

      {/* Card face */}
      <div
        className="bg-white px-4 py-3.5 flex items-center gap-3.5 relative"
        style={{
          transform:  `translateX(${cardX}px)`,
          transition: (cardX === 0 || snapped) ? 'transform 0.22s ease' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={snapped ? closeSwipe : undefined}
      >
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
          style={{ backgroundColor: '#F2F2F7' }}
        >
          {showImage ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-2xl leading-none select-none">{emoji}</span>
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate text-base leading-tight">{item.name}</p>
          <p className="text-sm text-gray-400 mt-0.5">
            {item.quantity > 1 ? `×${item.quantity} · ` : ''}
            {item.expiryDate ? `Expires ${formatDate(item.expiryDate)}` : 'No expiry date'}
          </p>
        </div>

        {/* Expiry badge */}
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
          style={{ backgroundColor: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
      </div>
    </div>
  );
}

// ── BottomTabBar ──────────────────────────────────────────────────────────────
function BottomTabBar({ active, onChange }) {
  const tabs = [
    {
      id: 'inventory',
      label: 'Inventory',
      icon: (on) => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: 'shopping',
      label: 'Shopping',
      icon: (on) => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'meals',
      label: 'Meals',
      icon: (on) => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'recipes',
      label: 'Recipes',
      icon: (on) => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: (on) => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 flex bg-white border-t border-gray-200 z-30"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(tab => {
        const on = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 active:opacity-60 transition-opacity"
            style={{ color: on ? '#007AFF' : '#8E8E93' }}
            aria-label={tab.label}
          >
            {tab.icon(on)}
            <span className="text-[9px] font-semibold tracking-wide">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({ location }) {
  const meta = LOCATION_META[location];
  return (
    <div className="flex flex-col items-center justify-center pt-24 text-center px-8">
      <div className="text-7xl mb-5 select-none">{meta.emptyIcon}</div>
      <p className="text-xl font-bold text-gray-700">{meta.emptyMsg}</p>
      <p className="text-sm text-gray-400 mt-2 leading-relaxed">
        Tap <strong>Scan Barcode</strong> to scan a product, or{' '}
        <strong>Add to {location}</strong> to enter one manually.
      </p>
    </div>
  );
}

// ── ManualEntryDrawer ─────────────────────────────────────────────────────────
function ManualEntryDrawer({ isOpen, onClose, onAdd, prefillName, prefillImageUrl, defaultLocation }) {
  const [name,     setName]     = useState('');
  const [expiry,   setExpiry]   = useState('');
  const [qty,      setQty]      = useState('1');
  const [location, setLocation] = useState(defaultLocation ?? 'Fridge');
  const [category, setCategory] = useState('');
  const nameRef  = useRef(null);
  const expiryRef = useRef(null);

  // Auto-detect location & category as the user types
  useEffect(() => {
    if (name.trim().length > 2) {
      const cat = getItemCategory(name);
      setCategory(cat || '');
      setLocation(getDefaultLocation(name, cat));
    }
  }, [name]);

  // Sync when drawer opens
  useEffect(() => {
    if (isOpen) {
      const pName = prefillName ?? '';
      setName(pName);
      setExpiry('');
      setQty('1');

      if (pName) {
        const cat = getItemCategory(pName);
        setCategory(cat || '');
        setLocation(getDefaultLocation(pName, cat));
      } else {
        setCategory('');
        setLocation(defaultLocation ?? 'Fridge');
      }

      setTimeout(() => {
        pName ? expiryRef.current?.focus() : nameRef.current?.focus();
      }, 320);
    }
  }, [isOpen, prefillName, defaultLocation]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      id:         `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name:       name.trim(),
      expiryDate: expiry || null,
      quantity:   Math.max(1, parseInt(qty, 10) || 1),
      addedAt:    new Date().toISOString(),
      imageUrl:   prefillImageUrl ?? null,
      location,
      category:   category || getItemCategory(name) || 'Other',
    });
    onClose();
  };

  const inputClass =
    'w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-base text-gray-900 ' +
    'placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#007AFF] transition';

  const locMeta = LOCATION_META[location];

  return (
    <>
      {/* Scrim */}
      <div
        role="presentation"
        className="fixed inset-0 bg-black transition-opacity duration-300 z-40"
        style={{ opacity: isOpen ? 0.4 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add item"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[2rem] shadow-2xl
                   transition-transform duration-300 ease-out"
        style={{
          transform:    isOpen ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          fontFamily:   IOS_FONT,
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-[5px] rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pb-6 pt-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Add Item</h2>
            <button onClick={onClose} className="text-gray-400 active:text-gray-600 p-1" aria-label="Close">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Location selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Storage Location
              </label>
              <div className="flex gap-1 bg-[#F2F2F7] rounded-xl p-1">
                {LOCATIONS.map(loc => {
                  const m      = LOCATION_META[loc];
                  const active = location === loc;
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setLocation(loc)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={active
                        ? { backgroundColor: '#fff', color: m.color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                        : { color: '#8E8E93' }}
                    >
                      <span className="text-base leading-none">{m.icon}</span>
                      {loc}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Item Name
              </label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Whole Milk"
                className={inputClass}
                required
                autoComplete="off"
              />
              {category && (
                <p className="text-xs text-gray-400 mt-1 pl-1">
                  Category: <span className="font-semibold text-gray-500">{category}</span>
                  {' · '}Location set to <span className="font-semibold" style={{ color: locMeta.color }}>{location}</span>
                </p>
              )}
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Expiry Date
                <span className="font-normal normal-case text-gray-400 ml-1">(optional)</span>
              </label>
              <input
                ref={expiryRef}
                type="date"
                value={expiry}
                onChange={e => setExpiry(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={inputClass}
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Quantity
              </label>
              <input
                type="number"
                value={qty}
                onChange={e => setQty(e.target.value)}
                min="1"
                max="99"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 rounded-2xl text-white text-base font-bold mt-1 active:opacity-80 transition-opacity"
              style={{ backgroundColor: locMeta.color }}
            >
              Add to {location} {locMeta.icon}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── EditDrawer ────────────────────────────────────────────────────────────────
function EditDrawer({ isOpen, onClose, onSave, item }) {
  const [name,     setName]     = useState('');
  const [expiry,   setExpiry]   = useState('');
  const [qty,      setQty]      = useState('1');
  const [location, setLocation] = useState('Fridge');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (isOpen && item) {
      setName(item.name ?? '');
      setExpiry(item.expiryDate ?? '');
      setQty(String(item.quantity ?? 1));
      setLocation(item.location ?? 'Fridge');
      setCategory(item.category ?? '');
    }
  }, [isOpen, item]);

  // Auto-detect category as user changes name
  useEffect(() => {
    if (name.trim().length > 2) {
      const cat = getItemCategory(name);
      if (cat) setCategory(cat);
    }
  }, [name]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !item) return;
    onSave({
      ...item,
      name:       name.trim(),
      expiryDate: expiry || null,
      quantity:   Math.max(1, parseInt(qty, 10) || 1),
      location,
      category:   category || getItemCategory(name) || 'Other',
    });
    onClose();
  };

  const inputClass =
    'w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-base text-gray-900 ' +
    'placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#34C759] transition';

  const locMeta = LOCATION_META[location] ?? LOCATION_META.Fridge;

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 bg-black transition-opacity duration-300 z-40"
        style={{ opacity: isOpen ? 0.4 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit item"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[2rem] shadow-2xl
                   transition-transform duration-300 ease-out"
        style={{
          transform:     isOpen ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          fontFamily:    IOS_FONT,
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-[5px] rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pb-6 pt-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Edit Item</h2>
            <button onClick={onClose} className="text-gray-400 active:text-gray-600 p-1" aria-label="Close">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Storage Location
              </label>
              <div className="flex gap-1 bg-[#F2F2F7] rounded-xl p-1">
                {LOCATIONS.map(loc => {
                  const m = LOCATION_META[loc];
                  const active = location === loc;
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setLocation(loc)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={active
                        ? { backgroundColor: '#fff', color: m.color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                        : { color: '#8E8E93' }}
                    >
                      <span className="text-base leading-none">{m.icon}</span>
                      {loc}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Item Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputClass}
                required
                autoComplete="off"
              />
              {category && (
                <p className="text-xs text-gray-400 mt-1 pl-1">
                  Category: <span className="font-semibold text-gray-500">{category}</span>
                </p>
              )}
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Expiry Date
                <span className="font-normal normal-case text-gray-400 ml-1">(optional)</span>
              </label>
              <input
                type="date"
                value={expiry}
                onChange={e => setExpiry(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQty(q => String(Math.max(1, parseInt(q, 10) - 1)))}
                  className="w-12 h-12 rounded-xl bg-[#F2F2F7] text-2xl font-bold text-gray-600 flex items-center justify-center active:opacity-60"
                >−</button>
                <input
                  type="number"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  min="1"
                  max="99"
                  className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-base text-center text-gray-900 outline-none focus:ring-2 focus:ring-[#34C759]"
                />
                <button
                  type="button"
                  onClick={() => setQty(q => String(Math.min(99, parseInt(q, 10) + 1)))}
                  className="w-12 h-12 rounded-xl bg-[#F2F2F7] text-2xl font-bold text-gray-600 flex items-center justify-center active:opacity-60"
                >+</button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 rounded-2xl text-white text-base font-bold mt-1 active:opacity-80 transition-opacity"
              style={{ backgroundColor: '#34C759' }}
            >
              Save Changes ✓
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── SettingsSheet ────────────────────────────────────────────────────────────
function SettingsSheet({ isOpen, onClose }) {
  const { apiKey, saveApiKey, clearApiKey } = useApiKey();
  const [draft,   setDraft]   = useState('');
  const [saved,   setSaved]   = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (isOpen) { setDraft(''); setSaved(false); setEditing(false); }
  }, [isOpen]);

  const handleSave = async () => {
    if (!draft.trim()) return;
    await saveApiKey(draft.trim());
    setDraft('');
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClear = () => { clearApiKey(); setEditing(false); };

  return (
    <>
      <div
        className="fixed inset-0 bg-black transition-opacity duration-300 z-40"
        style={{ opacity: isOpen ? 0.4 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[2rem] shadow-2xl
                   transition-transform duration-300 ease-out"
        style={{
          transform:     isOpen ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          fontFamily:    IOS_FONT,
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-[5px] rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pb-6 pt-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-gray-900">Settings</h2>
            <button onClick={onClose} className="text-gray-400 active:text-gray-600 p-1" aria-label="Close">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
              </svg>
            </button>
          </div>

          {/* API Key section */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Claude API Key</p>
          <div className="bg-[#F2F2F7] rounded-2xl p-4 mb-4">
            {apiKey && !editing ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <p className="text-sm font-semibold text-gray-700">Key saved</p>
                  {saved && <span className="text-xs text-green-500 font-semibold ml-auto">Updated ✓</span>}
                </div>
                <p className="text-xs text-gray-400 font-mono mb-3">
                  {apiKey.slice(0, 12)}{'•'.repeat(16)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white active:opacity-80"
                    style={{ backgroundColor: '#007AFF' }}
                  >
                    Update Key
                  </button>
                  <button
                    onClick={handleClear}
                    className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold text-red-500 active:opacity-80"
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3 leading-relaxed">
                  {apiKey ? 'Enter a new key to replace the current one.' : 'Required for AI Import, Recipe Import, and the Chat assistant.'}
                </p>
                <input
                  type="password"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="sk-ant-api03-…"
                  className="w-full px-4 py-3 bg-white rounded-xl text-sm text-gray-900
                             placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#007AFF] mb-3"
                  autoComplete="off"
                  autoCorrect="off"
                />
                <p className="text-xs text-gray-400 mb-3">
                  Encrypted and synced between both household devices. Get a key at{' '}
                  <span style={{ color: '#007AFF' }}>console.anthropic.com</span>
                </p>
                <div className="flex gap-2">
                  {apiKey && (
                    <button
                      onClick={() => setEditing(false)}
                      className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold text-gray-600 active:opacity-70"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={!draft.trim()}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 active:opacity-80"
                    style={{ backgroundColor: '#007AFF' }}
                  >
                    Save Key
                  </button>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center leading-relaxed">
            Your key is AES-encrypted before leaving this device.
            Only your household can decrypt it.
          </p>
        </div>
      </div>
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [items,           setItems]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [view,            setView]            = useState('list');
  const [activeTab,       setActiveTab]       = useState('inventory');
  const [selectedLoc,     setSelectedLoc]     = useState('Fridge');
  const [drawerOpen,      setDrawerOpen]      = useState(false);
  const [aiDrawerOpen,    setAiDrawerOpen]    = useState(false);
  const [editingItem,     setEditingItem]     = useState(null);
  const [prefillName,     setPrefillName]     = useState('');
  const [prefillImageUrl, setPrefillImageUrl] = useState(null);
  const [notifState,      setNotifState]      = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [inventorySearch, setInventorySearch] = useState('');
  const [settingsOpen,    setSettingsOpen]    = useState(false);
  const [swUpdated,       setSwUpdated]       = useState(false);

  // Pull-to-refresh
  const PULL_THRESHOLD  = 80;
  const scrollRef       = useRef(null);
  const pullStartY      = useRef(null);
  const [pullY,         setPullY]         = useState(0);
  const [isRefreshing,  setIsRefreshing]  = useState(false);

  // Reconnection tracking
  const lastFetchedAt   = useRef(Date.now());
  const channelRef      = useRef(null);

  // ── Fetch inventory ───────────────────────────────────────────────────────
  const refreshInventory = useCallback(async () => {
    const { data, error } = await supabase
      .from('fridge_items')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .order('added_at', { ascending: false });
    if (!error && data) setItems(data.map(rowToItem));
    lastFetchedAt.current = Date.now();
    return !error;
  }, []);

  // ── Subscribe (or re-subscribe) to real-time changes ─────────────────────
  const subscribe = useCallback(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`items-sync-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fridge_items',
          filter: `household_id=eq.${HOUSEHOLD_ID}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT') {
            setItems(prev =>
              prev.some(i => i.id === row.id) ? prev : [rowToItem(row), ...prev]
            );
          } else if (eventType === 'DELETE') {
            setItems(prev => prev.filter(i => i.id !== old.id));
          } else if (eventType === 'UPDATE') {
            setItems(prev => prev.map(i => i.id === row.id ? rowToItem(row) : i));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          // Auto-retry after 3s
          setTimeout(() => subscribe(), 3000);
        }
      });
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    refreshInventory().then(() => setLoading(false));
    subscribe();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [refreshInventory, subscribe]);

  // ── SW update banner ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setSwUpdated(true);
    window.addEventListener('sw-updated', handler);
    return () => window.removeEventListener('sw-updated', handler);
  }, []);

  // ── Reconnection + expiry notifications ──────────────────────────────────
  useEffect(() => {
    if (loading) return;

    const STALE_MS = 5 * 60 * 1000; // re-fetch if stale for > 5 min

    sendExpiryNotifications(items);

    const onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      sendExpiryNotifications(items);
      if (Date.now() - lastFetchedAt.current > STALE_MS) {
        await refreshInventory();
        subscribe(); // re-subscribe in case WebSocket dropped
      }
    };

    const onOnline = async () => {
      await refreshInventory();
      subscribe();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [items, loading, refreshInventory, subscribe]);

  // ── Optimistic handlers ───────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    setItems(prev => prev.filter(i => i.id !== id)); // optimistic
    const { error } = await supabase
      .from('fridge_items')
      .delete()
      .eq('id', id)
      .eq('household_id', HOUSEHOLD_ID);
    if (error) console.error('Delete failed:', error.message);
  }, []);

  const handleAdd = useCallback(async (item) => {
    setItems(prev => [item, ...prev]); // optimistic
    if (item.location) setSelectedLoc(item.location);
    const { error } = await supabase
      .from('fridge_items')
      .insert(itemToRow(item));
    if (error) {
      console.error('Insert failed:', error.message);
      setItems(prev => prev.filter(i => i.id !== item.id)); // rollback
    }
  }, []);

  const handleEdit = useCallback(async (updatedItem) => {
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i)); // optimistic
    const { error } = await supabase
      .from('fridge_items')
      .update(itemToRow(updatedItem))
      .eq('id', updatedItem.id)
      .eq('household_id', HOUSEHOLD_ID);
    if (error) console.error('Update failed:', error.message);
  }, []);

  const handleScanSuccess = useCallback(({ name, imageUrl }) => {
    setPrefillName(name);
    setPrefillImageUrl(imageUrl ?? null);
    setView('list');
    setTimeout(() => setDrawerOpen(true), 200);
  }, []);

  const openAddDrawer = () => {
    setPrefillName('');
    setPrefillImageUrl(null);
    setDrawerOpen(true);
  };

  // ── Pull-to-refresh handlers ──────────────────────────────────────────────
  const handlePTRStart = (e) => {
    if (scrollRef.current?.scrollTop > 0) return;
    pullStartY.current = e.touches[0].clientY;
  };
  const handlePTRMove = (e) => {
    if (pullStartY.current === null) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy < 0) { pullStartY.current = null; return; }
    setPullY(Math.min(dy, PULL_THRESHOLD * 1.6));
  };
  const handlePTREnd = async () => {
    if (pullStartY.current === null) return;
    pullStartY.current = null;
    if (pullY >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      await refreshInventory();
      setIsRefreshing(false);
    }
    setPullY(0);
  };

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await refreshInventory();
    setIsRefreshing(false);
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotifPermission();
    setNotifState(granted ? 'granted' : 'denied');
    if (granted) sendExpiryNotifications(items);
  };

  // Filter to selected location, sort soonest-expiry first (no-date at bottom)
  const locationItems = items
    .filter(i => (i.location ?? 'Fridge') === selectedLoc)
    .filter(i => !inventorySearch.trim() || i.name.toLowerCase().includes(inventorySearch.trim().toLowerCase()))
    .sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate) - new Date(b.expiryDate);
    });

  const grouped = groupByCategory(locationItems);

  if (view === 'scanner') {
    return (
      <ScannerComponent
        onSuccess={handleScanSuccess}
        onClose={() => setView('list')}
      />
    );
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: '#F2F2F7', fontFamily: IOS_FONT }}
      >
        <div
          className="w-12 h-12 rounded-full border-[3px] animate-spin"
          style={{ borderColor: '#007AFF', borderTopColor: 'transparent' }}
        />
        <p className="text-gray-400 text-sm font-medium">Loading your fridge…</p>
      </div>
    );
  }

  const locMeta = LOCATION_META[selectedLoc];

  // Tab bar height + safe area bottom = content bottom clearance
  // Tab bar: 56px + safe-area. Action bar: ~68px above that.
  const TAB_BAR_H = 56; // px, matches the tab bar button area

  return (
    <ApiKeyProvider>
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: '#F2F2F7',
        fontFamily:       IOS_FONT,
        paddingTop:       'env(safe-area-inset-top)',
      }}
    >
      {/* SW update banner */}
      {swUpdated && (
        <div
          className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 py-3 text-white text-sm font-semibold"
          style={{ backgroundColor: '#34C759', paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <span>App updated — tap to reload</span>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-white/20 rounded-lg active:opacity-70 text-xs font-bold"
          >
            Reload
          </button>
        </div>
      )}
      {/* ════════════════════════════════════════════════════════════════
          INVENTORY TAB
      ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'inventory' && (
        <>
          {/* Header */}
          <header className="px-5 pt-5 pb-3 flex items-start justify-between shrink-0">
            <div>
              <h1 className="text-[2rem] font-bold tracking-tight text-gray-900 leading-none">
                FridgeTrack
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {items.length} item{items.length !== 1 ? 's' : ''} tracked
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {/* Manual refresh */}
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="w-9 h-9 rounded-xl flex items-center justify-center active:opacity-70 transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#F2F2F7' }}
                aria-label="Refresh inventory"
              >
                <svg
                  className={`w-4 h-4 text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              {/* AI Import */}
              <button
                onClick={() => setAiDrawerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl active:opacity-70 transition-opacity"
                style={{ backgroundColor: '#EEF4FF', color: '#007AFF' }}
                aria-label="AI Import"
              >
                <span className="text-base leading-none">✨</span>
                <span className="text-sm font-semibold">AI Import</span>
              </button>
              {/* Settings */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 rounded-xl flex items-center justify-center active:opacity-70 transition-opacity"
                style={{ backgroundColor: '#F2F2F7' }}
                aria-label="Settings"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </header>

          {/* Location tabs */}
          <LocationTabs selected={selectedLoc} onChange={loc => { setSelectedLoc(loc); setInventorySearch(''); }} />

          {/* Search bar */}
          <div className="px-4 pb-2 shrink-0">
            <div className="flex items-center gap-2 bg-[#E5E5EA] rounded-xl px-3 py-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                value={inventorySearch}
                onChange={e => setInventorySearch(e.target.value)}
                placeholder={`Search ${selectedLoc}…`}
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
              />
              {inventorySearch && (
                <button onClick={() => setInventorySearch('')} className="text-gray-400 active:text-gray-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Expiry alert banner */}
          <AlertBanner items={items} />

          {/* Notification prompt */}
          {notifState === 'default' && (
            <button
              onClick={handleEnableNotifications}
              className="mx-4 mb-3 px-4 py-3 rounded-2xl flex items-center gap-3 active:opacity-80"
              style={{ backgroundColor: '#EEF4FF' }}
            >
              <span className="text-xl leading-none">🔔</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold" style={{ color: '#007AFF' }}>
                  Enable expiry notifications
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Get alerted when items are about to expire
                </p>
              </div>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Pull-to-refresh indicator */}
          {(pullY > 0 || isRefreshing) && (
            <div
              className="flex items-center justify-center shrink-0 overflow-hidden transition-all"
              style={{ height: isRefreshing ? 44 : Math.min(pullY * 0.55, 44) }}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 border-[#007AFF] border-t-transparent ${
                  isRefreshing || pullY >= PULL_THRESHOLD ? 'animate-spin' : ''
                }`}
                style={{
                  transform: `rotate(${isRefreshing ? 0 : (pullY / PULL_THRESHOLD) * 360}deg)`,
                }}
              />
            </div>
          )}

          {/* Grouped item list — pb clears action bar + tab bar */}
          <main
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4"
            style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px + 88px)` }}
            onTouchStart={handlePTRStart}
            onTouchMove={handlePTRMove}
            onTouchEnd={handlePTREnd}
          >
            {locationItems.length === 0 ? (
              <EmptyState location={selectedLoc} />
            ) : (
              grouped.map(({ category, items: catItems }) => (
                <div key={category}>
                  <CategoryHeader title={category} />
                  <div className="space-y-2">
                    {catItems.map(item => (
                      <ItemCard key={item.id} item={item} onDelete={handleDelete} onEdit={setEditingItem} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </main>

          {/* Floating action bar — sits directly above the tab bar */}
          <nav
            className="fixed left-0 right-0 px-4 flex gap-3 z-20"
            style={{
              bottom:     `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px)`,
              paddingTop: 12,
              paddingBottom: 8,
              background: 'linear-gradient(to top, #F2F2F7 55%, transparent)',
            }}
          >
            <button
              onClick={() => setView('scanner')}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white
                         rounded-2xl shadow-sm font-semibold text-sm active:opacity-70 transition-opacity"
              style={{ color: '#007AFF', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
              aria-label="Open barcode scanner"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 7V5a2 2 0 012-2h2M3 17v2a2 2 0 002 2h2m10-16h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2h-2
                     M7 8h.01M7 12h.01M7 16h.01M12 8h.01M12 12h.01M12 16h.01M17 8h.01M17 12h.01M17 16h.01" />
              </svg>
              Scan Barcode
            </button>
            <button
              onClick={openAddDrawer}
              className="flex-1 flex items-center justify-center gap-2 py-3.5
                         rounded-2xl text-white font-semibold text-sm active:opacity-80 transition-opacity"
              style={{ backgroundColor: locMeta.color }}
              aria-label={`Add item to ${selectedLoc}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add to {selectedLoc}
            </button>
          </nav>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          SHOPPING TAB
      ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'shopping' && (
        <div
          className="flex flex-col flex-1"
          style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px)` }}
        >
          <GroceryList />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PLANNED MEALS TAB
      ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'meals' && (
        <div
          className="flex flex-col flex-1"
          style={{ backgroundColor: '#F2F2F7' }}
        >
          <PlannedMeals />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          RECIPES TAB
      ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'recipes' && (
        <div
          className="flex flex-col flex-1"
          style={{ backgroundColor: '#F2F2F7' }}
        >
          <RecipesTab />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          CHAT TAB — always mounted to preserve conversation history
      ════════════════════════════════════════════════════════════════ */}
      <div
        className="flex flex-col flex-1"
        style={{
          backgroundColor: '#F2F2F7',
          display: activeTab === 'chat' ? 'flex' : 'none',
        }}
      >
        <ChatbotTab inventoryItems={items} />
      </div>

      {/* ── Persistent bottom tab bar ─────────────────────────────────── */}
      <BottomTabBar active={activeTab} onChange={setActiveTab} />

      {/* ── Drawers (inventory tab) ───────────────────────────────────── */}
      <ManualEntryDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAdd={handleAdd}
        prefillName={prefillName}
        prefillImageUrl={prefillImageUrl}
        defaultLocation={selectedLoc}
      />
      <AIImportDrawer
        isOpen={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        onAdd={handleAdd}
      />
      <EditDrawer
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleEdit}
        item={editingItem}
      />
      <SettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
    </ApiKeyProvider>
  );
}
