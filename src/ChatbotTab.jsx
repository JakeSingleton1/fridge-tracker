import React, { useState, useRef, useEffect } from 'react';
import { supabase, HOUSEHOLD_ID } from './supabase';

const IOS_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif';

const API_KEY_STORAGE = 'fridgetrack_claude_key';
const MODEL = 'claude-sonnet-4-6';
const TAB_BAR_H = 56;

const STORES = [
  { id: 'target', label: 'Target', icon: '🎯', color: '#CC0000' },
  { id: 'heb',    label: 'H-E-B',  icon: '🛒', color: '#E31837' },
  { id: 'costco', label: 'Costco', icon: '🏪', color: '#005DAA' },
];

// ── Fetch all context from Supabase ──────────────────────────────────────────
async function fetchContext() {
  const [inventoryRes, groceryRes, mealsRes, recipesRes] = await Promise.all([
    supabase.from('fridge_items').select('name,location,expiry_date,quantity').eq('household_id', HOUSEHOLD_ID),
    supabase.from('grocery_items').select('name,store_id,checked').eq('household_id', HOUSEHOLD_ID),
    supabase.from('planned_meals').select('name,planned_date,notes').eq('household_id', HOUSEHOLD_ID),
    supabase.from('recipes').select('name,description,servings_base,ingredients').eq('household_id', HOUSEHOLD_ID),
  ]);

  const inventory = (inventoryRes.data ?? []).map(r =>
    `${r.name} (${r.location}${r.expiry_date ? `, expires ${r.expiry_date}` : ''}${r.quantity > 1 ? `, qty ${r.quantity}` : ''})`
  ).join('; ') || 'none';

  const grocery = STORES.map(s => {
    const items = (groceryRes.data ?? []).filter(r => r.store_id === s.id && !r.checked);
    return items.length ? `${s.label}: ${items.map(r => r.name).join(', ')}` : '';
  }).filter(Boolean).join(' | ') || 'none';

  const meals = (mealsRes.data ?? [])
    .map(r => `${r.name}${r.planned_date ? ` (${r.planned_date})` : ''}`)
    .join(', ') || 'none';

  const recipes = (recipesRes.data ?? [])
    .map(r => `${r.name} (serves ${r.servings_base}, ${(r.ingredients ?? []).length} ingredients)`)
    .join('; ') || 'none';

  return { inventory, grocery, meals, recipes };
}

// ── Claude API call ──────────────────────────────────────────────────────────
async function callChatbot(apiKey, history, ctx) {
  const system = `You are a helpful meal planning and grocery assistant for a fridge tracking app.

Current inventory: ${ctx.inventory}
Grocery lists: ${ctx.grocery}
Planned meals: ${ctx.meals}
Saved recipes: ${ctx.recipes}

Always respond in valid JSON (no markdown fences):
{
  "message": "Your conversational response here",
  "actions": []
}

Actions are optional — only include when specifically suggesting items to add. Supported types:
- { "type": "add_to_shopping", "store": "heb"|"target"|"costco", "items": ["item1", "item2"] }
- { "type": "add_to_meals", "name": "Meal Name", "date": "YYYY-MM-DD" | null }

You can suggest multiple actions. Default store to "heb" unless context suggests otherwise.
Keep responses friendly, concise, and practical. Suggest meals using what's available in inventory.`;

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
      max_tokens: 1024,
      system,
      messages:   history,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `API error ${res.status}`);
  }

  const data = await res.json();
  const raw  = data.content?.[0]?.text?.trim() ?? '';

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    try { return JSON.parse(match?.[1] ?? raw); }
    catch { return { message: raw, actions: [] }; }
  }
}

// ── Action handlers ──────────────────────────────────────────────────────────
async function executeAddToShopping(items, storeId) {
  for (const name of items) {
    await supabase.from('grocery_items').insert({
      id:           `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      household_id: HOUSEHOLD_ID,
      store_id:     storeId,
      name,
      checked:      false,
      added_at:     new Date().toISOString(),
    });
  }
}

async function executeAddToMeals(name, date) {
  await supabase.from('planned_meals').insert({
    id:           `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    household_id: HOUSEHOLD_ID,
    name,
    planned_date: date ?? null,
    added_at:     new Date().toISOString(),
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────
function ActionButton({ action, onDone }) {
  const [state,    setState]    = useState('idle'); // idle | loading | done | error
  const [storeId,  setStoreId]  = useState(action.store ?? 'heb');

  const isShop  = action.type === 'add_to_shopping';
  const isMeals = action.type === 'add_to_meals';

  const execute = async (sid) => {
    setState('loading');
    try {
      if (isShop)  await executeAddToShopping(action.items, sid ?? storeId);
      if (isMeals) await executeAddToMeals(action.name, action.date);
      setState('done');
      onDone?.();
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
        style={{ backgroundColor: '#E5F8EF', color: '#34C759' }}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Added!
      </div>
    );
  }

  if (isShop) {
    const store = STORES.find(s => s.id === storeId) ?? STORES[1];
    return (
      <div className="flex flex-col gap-1.5">
        {/* Store selector */}
        <div className="flex gap-1 bg-[#E5E5EA] rounded-lg p-0.5">
          {STORES.map(s => (
            <button
              key={s.id}
              onClick={() => setStoreId(s.id)}
              className="flex-1 py-1 rounded-md text-[10px] font-bold transition-all"
              style={storeId === s.id
                ? { backgroundColor: '#fff', color: s.color }
                : { color: '#8E8E93' }}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => execute(storeId)}
          disabled={state === 'loading'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white active:opacity-80 disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: store.color }}
        >
          {state === 'loading' ? (
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          )}
          Add {action.items?.length} item{action.items?.length !== 1 ? 's' : ''} to {store.label}
        </button>
        {state === 'error' && <p className="text-xs text-red-500">Failed. Try again.</p>}
      </div>
    );
  }

  if (isMeals) {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() => execute()}
          disabled={state === 'loading'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white active:opacity-80 disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: '#FF9500' }}
        >
          {state === 'loading' ? (
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : '🍽️'}
          Plan "{action.name}"{action.date ? ` for ${action.date}` : ''}
        </button>
        {state === 'error' && <p className="text-xs text-red-500">Failed. Try again.</p>}
      </div>
    );
  }

  return null;
}

function AssistantMessage({ msg }) {
  const [actionsKey, setActionsKey] = useState(0);

  return (
    <div className="flex gap-2.5 mb-4">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm select-none"
        style={{ backgroundColor: '#EEF4FF' }}>
        ✨
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm mb-2"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p className="text-base text-gray-900 leading-relaxed whitespace-pre-wrap">{msg.message}</p>
        </div>
        {msg.actions?.length > 0 && (
          <div className="flex flex-col gap-2 ml-1" key={actionsKey}>
            {msg.actions.map((action, i) => (
              <ActionButton
                key={`${actionsKey}-${i}`}
                action={action}
                onDone={() => setActionsKey(k => k + 1)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ text }) {
  return (
    <div className="flex justify-end mb-4">
      <div
        className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tr-sm text-white text-base leading-relaxed"
        style={{ backgroundColor: '#007AFF' }}
      >
        {text}
      </div>
    </div>
  );
}

// ── API key setup screen ──────────────────────────────────────────────────────
function ApiKeySetup({ onSave }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center">
      <div className="text-6xl mb-5 select-none">✨</div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">AI Meal Assistant</h2>
      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
        Get meal ideas based on what's in your fridge, add items to shopping lists, and plan meals — all through conversation.
      </p>
      <div className="w-full space-y-3">
        <input
          type="password"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Paste your Claude API key (sk-ant-…)"
          className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-base text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#007AFF]"
          autoComplete="off"
        />
        <button
          onClick={() => { if (draft.trim()) { localStorage.setItem(API_KEY_STORAGE, draft.trim()); onSave(draft.trim()); } }}
          disabled={!draft.trim()}
          className="w-full py-4 rounded-2xl text-white text-base font-bold disabled:opacity-40 active:opacity-80 transition-opacity"
          style={{ backgroundColor: '#007AFF' }}
        >
          Get Started
        </button>
      </div>
    </div>
  );
}

// ── Main ChatbotTab ──────────────────────────────────────────────────────────
export default function ChatbotTab({ inventoryItems }) {
  const [apiKey,   setApiKey]   = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', text?, message?, actions? }
  const [history,  setHistory]  = useState([]); // Claude API history format
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);

    const newHistory = [...history, { role: 'user', content: text }];
    setHistory(newHistory);
    setLoading(true);

    try {
      const ctx    = await fetchContext();
      const parsed = await callChatbot(apiKey, newHistory, ctx);

      const assistantMsg = {
        role:    'assistant',
        message: parsed.message ?? '',
        actions: parsed.actions ?? [],
      };

      setMessages(prev => [...prev, assistantMsg]);
      setHistory(prev => [...prev, { role: 'assistant', content: parsed.message ?? '' }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        message: `Sorry, something went wrong: ${e.message}`,
        actions: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!apiKey) {
    return (
      <div className="flex flex-col h-full" style={{ fontFamily: IOS_FONT, paddingBottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px)` }}>
        <header className="px-5 pt-5 pb-3 shrink-0">
          <h1 className="text-[2rem] font-bold tracking-tight text-gray-900 leading-none">Chat</h1>
        </header>
        <ApiKeySetup onSave={setApiKey} />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{
        fontFamily:    IOS_FONT,
        paddingBottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_H}px)`,
      }}
    >
      {/* Header */}
      <header className="px-5 pt-5 pb-3 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-[2rem] font-bold tracking-tight text-gray-900 leading-none">Chat</h1>
          <p className="text-sm text-gray-400 mt-1">AI meal & grocery assistant</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setHistory([]); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl active:opacity-60"
            style={{ backgroundColor: '#F2F2F7', color: '#8E8E93' }}
          >
            Clear
          </button>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-2">
        {messages.length === 0 && (
          <div className="pt-6 pb-4">
            <div className="bg-white rounded-2xl p-4 mb-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <p className="text-sm font-semibold text-gray-700 mb-2">Try asking:</p>
              {[
                'What can I make for dinner tonight?',
                'I need to restock — what am I running low on?',
                'Plan meals for the week using what I have.',
                'Add eggs, milk, and bread to my H-E-B list.',
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="w-full text-left text-sm text-gray-500 py-1.5 px-3 rounded-xl mb-1 active:bg-gray-50 transition-colors"
                  style={{ backgroundColor: '#F9F9F9' }}
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <UserMessage key={i} text={msg.text} />
          ) : (
            <AssistantMessage key={i} msg={msg} />
          )
        )}

        {loading && (
          <div className="flex gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm select-none"
              style={{ backgroundColor: '#EEF4FF' }}>
              ✨
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: '#D1D5DB', animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 pt-2 pb-3"
        style={{ background: 'linear-gradient(to top, #F2F2F7 80%, transparent)' }}
      >
        <div className="flex gap-2.5 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about meals, groceries, recipes…"
            rows={1}
            className="flex-1 px-4 py-3 bg-white rounded-2xl text-base text-gray-900 placeholder-gray-300
                       outline-none resize-none overflow-hidden leading-snug"
            style={{
              boxShadow:  '0 1px 3px rgba(0,0,0,0.08)',
              maxHeight:  '120px',
              overflowY:  'auto',
            }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white
                       disabled:opacity-35 active:opacity-80 transition-opacity self-end"
            style={{ backgroundColor: '#007AFF' }}
            aria-label="Send"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
