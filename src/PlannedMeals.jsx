import React, { useState, useEffect, useRef } from 'react';
import { supabase, HOUSEHOLD_ID, rowToMeal, mealToRow } from './supabase';

const IOS_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif';

const ACCENT = '#FF9500';

// ── Date helpers ──────────────────────────────────────────────────────────────
function formatMealDate(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d     = new Date(dateStr + 'T00:00:00'); d.setHours(0, 0, 0, 0);
  const diff  = Math.round((d - today) / 86_400_000);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMealGroup(dateStr) {
  if (!dateStr) return 'No Date';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d     = new Date(dateStr + 'T00:00:00'); d.setHours(0, 0, 0, 0);
  const diff  = Math.round((d - today) / 86_400_000);
  if (diff < 0)  return 'Past';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6)  return 'This Week';
  return 'Later';
}

const GROUP_ORDER = ['Today', 'Tomorrow', 'This Week', 'Later', 'Past', 'No Date'];

function groupMeals(meals) {
  const map = {};
  meals.forEach(m => {
    const g = getMealGroup(m.date);
    if (!map[g]) map[g] = [];
    map[g].push(m);
  });
  return GROUP_ORDER
    .filter(g => map[g]?.length)
    .map(g => ({
      group: g,
      meals: map[g].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
      }),
    }));
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

// ── Swipeable MealRow ─────────────────────────────────────────────────────────
const SWIPE_W = 80;

function MealRow({ meal, onDelete, isLast }) {
  const [cardX, setCardX]   = useState(0);
  const [snapped, setSnapped] = useState(false);
  const touchStartX = useRef(null);

  const onTouchStart = e => { touchStartX.current = e.touches[0].clientX; };
  const onTouchMove  = e => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    setCardX(Math.max(-SWIPE_W, Math.min(0, dx)));
  };
  const onTouchEnd = () => {
    if (cardX <= -SWIPE_W * 0.55) { setCardX(-SWIPE_W); setSnapped(true); }
    else                           { setCardX(0);         setSnapped(false); }
    touchStartX.current = null;
  };

  return (
    <div className={`relative overflow-hidden bg-white ${!isLast ? 'border-b border-gray-100' : ''}`}>
      {/* Red delete panel */}
      <div
        className="absolute right-0 inset-y-0 flex items-center justify-center"
        style={{ width: SWIPE_W, backgroundColor: '#FF3B30' }}
      >
        <button
          onClick={() => onDelete(meal.id)}
          className="w-full h-full flex flex-col items-center justify-center gap-1 active:opacity-70"
          aria-label={`Delete ${meal.name}`}
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
        className="flex items-center px-4 py-3.5 gap-3 relative"
        style={{
          transform:  `translateX(${cardX}px)`,
          transition: (cardX === 0 || snapped) ? 'transform 0.22s ease' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={snapped ? () => { setCardX(0); setSnapped(false); } : undefined}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xl select-none"
          style={{ backgroundColor: '#FFF3E5' }}
        >
          🍽️
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-base truncate">{meal.name}</p>
          {meal.notes && (
            <p className="text-sm text-gray-400 truncate mt-0.5">{meal.notes}</p>
          )}
        </div>
        {meal.date && (
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
            style={{ backgroundColor: '#FFF3E5', color: ACCENT }}
          >
            {formatMealDate(meal.date)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Add Meal Sheet ────────────────────────────────────────────────────────────
function AddMealSheet({ isOpen, onClose, onAdd }) {
  const [name,  setName]  = useState('');
  const [date,  setDate]  = useState('');
  const [notes, setNotes] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName(''); setDate(''); setNotes('');
      setTimeout(() => nameRef.current?.focus(), 320);
    }
  }, [isOpen]);

  const handleSubmit = e => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      id:      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name:    name.trim(),
      date:    date   || null,
      notes:   notes.trim() || null,
      addedAt: new Date().toISOString(),
    });
    onClose();
  };

  const inputClass =
    'w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-base text-gray-900 ' +
    'placeholder-gray-400 outline-none focus:ring-2 transition';

  return (
    <>
      <div
        className="fixed inset-0 bg-black transition-opacity duration-300 z-40"
        style={{ opacity: isOpen ? 0.4 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[2rem] shadow-2xl transition-transform duration-300 ease-out"
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
            <h2 className="text-xl font-bold text-gray-900">Plan a Meal</h2>
            <button onClick={onClose} className="text-gray-400 active:text-gray-600 p-1" aria-label="Close">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.36 5.64a1 1 0 00-1.41 0L12 10.59 7.05 5.64a1 1 0 00-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 001.41 1.41L12 13.41l4.95 4.95a1 1 0 001.41-1.41L13.41 12l4.95-4.95a1 1 0 000-1.41z"/>
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Meal Name</label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Chicken Pasta"
                required
                className={inputClass}
                style={{ '--tw-ring-color': ACCENT }}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Date <span className="font-normal normal-case text-gray-400 ml-1">(optional)</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Notes <span className="font-normal normal-case text-gray-400 ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. use leftover chicken"
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              className="w-full py-4 rounded-2xl text-white text-base font-bold mt-1 active:opacity-80 transition-opacity"
              style={{ backgroundColor: ACCENT }}
            >
              Add to Plan 🍽️
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlannedMeals() {
  const [meals,      setMeals]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [sheetOpen,  setSheetOpen]  = useState(false);
  const [search,     setSearch]     = useState('');

  const TAB_BAR_H = 56;

  useEffect(() => {
    supabase
      .from('planned_meals')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .order('planned_date', { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (!error && data) setMeals(data.map(rowToMeal));
        setLoading(false);
      });

    const channel = supabase
      .channel('meals-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'planned_meals',
          filter: `household_id=eq.${HOUSEHOLD_ID}` },
        ({ eventType, new: row, old }) => {
          setMeals(prev => {
            if (eventType === 'INSERT')
              return prev.some(m => m.id === row.id) ? prev : [...prev, rowToMeal(row)];
            if (eventType === 'DELETE')
              return prev.filter(m => m.id !== old.id);
            if (eventType === 'UPDATE')
              return prev.map(m => m.id === row.id ? rowToMeal(row) : m);
            return prev;
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleAdd = async (meal) => {
    setMeals(prev => [...prev, meal]);
    const { error } = await supabase.from('planned_meals').insert(mealToRow(meal));
    if (error) {
      console.error('Add meal failed:', error.message);
      setMeals(prev => prev.filter(m => m.id !== meal.id));
    }
  };

  const handleDelete = async (id) => {
    setMeals(prev => prev.filter(m => m.id !== id));
    const { error } = await supabase
      .from('planned_meals').delete().eq('id', id).eq('household_id', HOUSEHOLD_ID);
    if (error) console.error('Delete meal failed:', error.message);
  };

  const filtered = search.trim()
    ? meals.filter(m => m.name.toLowerCase().includes(search.trim().toLowerCase()))
    : meals;

  const grouped = groupMeals(filtered);

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: IOS_FONT }}>
      {/* Header */}
      <header className="px-5 pt-5 pb-3 shrink-0">
        <h1 className="text-[2rem] font-bold tracking-tight text-gray-900 leading-none">Planned Meals</h1>
        <p className="text-sm text-gray-400 mt-1">
          {meals.length} meal{meals.length !== 1 ? 's' : ''} planned
        </p>
      </header>

      {/* Search */}
      <div className="px-4 pb-3 shrink-0">
        <SearchBar value={search} onChange={setSearch} placeholder="Search meals…" />
      </div>

      {/* List */}
      <div
        className="flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px + 80px)` }}
      >
        {loading ? (
          <div className="flex justify-center pt-16">
            <div
              className="w-8 h-8 rounded-full border-[3px] animate-spin"
              style={{ borderColor: ACCENT, borderTopColor: 'transparent' }}
            />
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center px-8">
            <div className="text-7xl mb-5 select-none">🗓️</div>
            <p className="text-xl font-bold text-gray-700">
              {search ? 'No results' : 'No meals planned'}
            </p>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              {search ? 'Try a different search.' : 'Tap Plan a Meal to get started.'}
            </p>
          </div>
        ) : (
          grouped.map(({ group, meals: gMeals }) => (
            <div key={group} className="mb-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 mb-2">{group}</p>
              <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {gMeals.map((m, i) => (
                  <MealRow key={m.id} meal={m} onDelete={handleDelete} isLast={i === gMeals.length - 1} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating add button */}
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
          onClick={() => setSheetOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-semibold text-sm active:opacity-80 transition-opacity"
          style={{ backgroundColor: ACCENT }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Plan a Meal
        </button>
      </nav>

      <AddMealSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} onAdd={handleAdd} />
    </div>
  );
}
