import React, { useState, useEffect, useRef } from 'react';
import { supabase, HOUSEHOLD_ID, rowToGrocery, groceryToRow } from './supabase';

const IOS_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif';

// ── Store definitions ─────────────────────────────────────────────────────────
const STORES = [
  { id: 'target',  label: 'Target',  icon: '🎯', color: '#CC0000' },
  { id: 'heb',     label: 'H-E-B',   icon: '🛒', color: '#E31837' },
  { id: 'costco',  label: 'Costco',  icon: '🏪', color: '#005DAA' },
];

// ── GroceryItem row ───────────────────────────────────────────────────────────
function GroceryItem({ item, isLast, onToggle, onDelete, color }) {
  return (
    <div
      className={`flex items-center px-4 py-3.5 gap-3 bg-white ${
        !isLast ? 'border-b border-gray-100' : ''
      }`}
    >
      <button
        onClick={onToggle}
        className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90"
        style={
          item.checked
            ? { backgroundColor: color, borderColor: color }
            : { borderColor: '#D1D5DB', backgroundColor: 'transparent' }
        }
        aria-label={item.checked ? 'Uncheck' : 'Check'}
      >
        {item.checked && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <p className={`flex-1 text-base transition-colors ${
        item.checked ? 'line-through text-gray-300' : 'text-gray-900 font-medium'
      }`}>
        {item.name}
      </p>

      <button
        onClick={onDelete}
        className="text-gray-200 active:text-red-400 transition-colors p-1 shrink-0"
        aria-label={`Remove ${item.name}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function EmptyState({ store }) {
  return (
    <div className="flex flex-col items-center justify-center pt-20 text-center px-8">
      <div className="text-6xl mb-4 select-none">{store.icon}</div>
      <p className="text-lg font-bold text-gray-700">{store.label} list is empty</p>
      <p className="text-sm text-gray-400 mt-1.5">
        Type an item below and tap <strong>+</strong> to add it.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GroceryList() {
  const [activeStore, setActiveStore] = useState('target');
  // All grocery items keyed by store id: { target: [...], heb: [...], costco: [...] }
  const [lists, setLists] = useState({ target: [], heb: [], costco: [] });
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  const store = STORES.find(s => s.id === activeStore);
  const items = lists[activeStore] ?? [];

  // ── Fetch all grocery items + real-time sync ────────────────────────────
  useEffect(() => {
    supabase
      .from('grocery_items')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .order('added_at', { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return;
        const grouped = { target: [], heb: [], costco: [] };
        data.forEach(row => {
          const item = rowToGrocery(row);
          if (grouped[item.storeId]) grouped[item.storeId].push(item);
        });
        setLists(grouped);
      });

    const channel = supabase
      .channel('grocery-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grocery_items',
          filter: `household_id=eq.${HOUSEHOLD_ID}` },
        ({ eventType, new: row, old }) => {
          const storeId = row?.store_id ?? old?.store_id;
          if (!storeId) return;

          setLists(prev => {
            const list = prev[storeId] ?? [];
            if (eventType === 'INSERT') {
              if (list.some(i => i.id === row.id)) return prev;
              return { ...prev, [storeId]: [rowToGrocery(row), ...list] };
            }
            if (eventType === 'DELETE') {
              return { ...prev, [storeId]: list.filter(i => i.id !== old.id) };
            }
            if (eventType === 'UPDATE') {
              return { ...prev, [storeId]: list.map(i => i.id === row.id ? rowToGrocery(row) : i) };
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Optimistic handlers ─────────────────────────────────────────────────
  const addItem = async (e) => {
    e?.preventDefault();
    const name = input.trim();
    if (!name) return;

    const newItem = {
      id:      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      storeId: activeStore,
      name,
      checked: false,
    };

    setLists(prev => ({ ...prev, [activeStore]: [newItem, ...(prev[activeStore] ?? [])] }));
    setInput('');
    inputRef.current?.focus();

    const { error } = await supabase
      .from('grocery_items')
      .insert(groceryToRow(newItem, activeStore));
    if (error) {
      console.error('Add failed:', error.message);
      setLists(prev => ({
        ...prev,
        [activeStore]: (prev[activeStore] ?? []).filter(i => i.id !== newItem.id),
      }));
    }
  };

  const toggleItem = async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Optimistic
    setLists(prev => ({
      ...prev,
      [activeStore]: prev[activeStore].map(i => i.id === id ? { ...i, checked: !i.checked } : i),
    }));

    const { error } = await supabase
      .from('grocery_items')
      .update({ checked: !item.checked })
      .eq('id', id)
      .eq('household_id', HOUSEHOLD_ID);
    if (error) console.error('Toggle failed:', error.message);
  };

  const deleteItem = async (id) => {
    setLists(prev => ({
      ...prev,
      [activeStore]: prev[activeStore].filter(i => i.id !== id),
    }));

    const { error } = await supabase
      .from('grocery_items')
      .delete()
      .eq('id', id)
      .eq('household_id', HOUSEHOLD_ID);
    if (error) console.error('Delete failed:', error.message);
  };

  const clearCompleted = async () => {
    const completedIds = items.filter(i => i.checked).map(i => i.id);
    if (!completedIds.length) return;

    setLists(prev => ({ ...prev, [activeStore]: prev[activeStore].filter(i => !i.checked) }));

    const { error } = await supabase
      .from('grocery_items')
      .delete()
      .in('id', completedIds)
      .eq('household_id', HOUSEHOLD_ID);
    if (error) console.error('Clear failed:', error.message);
  };

  const unchecked = items.filter(i => !i.checked);
  const checked   = items.filter(i =>  i.checked);

  const badgeCount = (storeId) => (lists[storeId] ?? []).filter(i => !i.checked).length;

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: IOS_FONT }}>
      {/* Header */}
      <header className="px-5 pt-5 pb-3 shrink-0">
        <h1 className="text-[2rem] font-bold tracking-tight text-gray-900 leading-none">
          Shopping Lists
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {STORES.reduce((acc, s) => acc + badgeCount(s.id), 0)} items to get
        </p>
      </header>

      {/* Store tabs */}
      <div className="flex gap-1 mx-4 mb-3 bg-[#E5E5EA] rounded-xl p-1 shrink-0">
        {STORES.map(s => {
          const active = activeStore === s.id;
          const count  = badgeCount(s.id);
          return (
            <button
              key={s.id}
              onClick={() => setActiveStore(s.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all active:opacity-80 relative"
              style={
                active
                  ? { backgroundColor: '#fff', color: s.color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  : { color: '#8E8E93' }
              }
            >
              <span className="text-base leading-none">{s.icon}</span>
              {s.label}
              {count > 0 && (
                <span
                  className="absolute -top-1 -right-0.5 min-w-[18px] h-[18px] rounded-full
                             text-white text-[10px] font-bold flex items-center justify-center px-1"
                  style={{ backgroundColor: active ? s.color : '#8E8E93' }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4">
        {items.length === 0 ? (
          <EmptyState store={store} />
        ) : (
          <>
            {unchecked.length > 0 && (
              <div className="rounded-2xl overflow-hidden mb-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {unchecked.map((item, idx) => (
                  <GroceryItem
                    key={item.id}
                    item={item}
                    isLast={idx === unchecked.length - 1}
                    onToggle={() => toggleItem(item.id)}
                    onDelete={() => deleteItem(item.id)}
                    color={store.color}
                  />
                ))}
              </div>
            )}

            {checked.length > 0 && (
              <>
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    In Cart ({checked.length})
                  </p>
                  <button
                    onClick={clearCompleted}
                    className="text-xs font-semibold active:opacity-60"
                    style={{ color: store.color }}
                  >
                    Clear all
                  </button>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  {checked.map((item, idx) => (
                    <GroceryItem
                      key={item.id}
                      item={item}
                      isLast={idx === checked.length - 1}
                      onToggle={() => toggleItem(item.id)}
                      onDelete={() => deleteItem(item.id)}
                      color={store.color}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Add item input */}
      <form
        onSubmit={addItem}
        className="shrink-0 flex gap-2.5 px-4 pt-3 pb-3"
        style={{ background: 'linear-gradient(to top, #F2F2F7 70%, transparent)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Add to ${store.label}…`}
          className="flex-1 px-4 py-3.5 bg-white rounded-2xl text-base text-gray-900
                     placeholder-gray-300 outline-none"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white
                     disabled:opacity-35 active:opacity-80 transition-opacity self-center"
          style={{ backgroundColor: store.color }}
          aria-label="Add item"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </form>
    </div>
  );
}
