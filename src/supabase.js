import { createClient } from '@supabase/supabase-js';

// ── Client ────────────────────────────────────────────────────────────────────
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Shared household ID ───────────────────────────────────────────────────────
// Both you and your girlfriend use the same app URL with the same env vars,
// so every read/write is scoped to this one household.
export const HOUSEHOLD_ID = import.meta.env.VITE_HOUSEHOLD_ID ?? 'default';

// ── Shape converters ──────────────────────────────────────────────────────────
// DB uses snake_case columns; the app uses camelCase. Convert at the boundary.

export function rowToItem(row) {
  return {
    id:         row.id,
    name:       row.name,
    expiryDate: row.expiry_date  ?? null,
    quantity:   row.quantity,
    category:   row.category,
    location:   row.location,
    imageUrl:   row.image_url   ?? null,
    addedAt:    row.added_at,
  };
}

export function itemToRow(item) {
  return {
    id:           item.id,
    household_id: HOUSEHOLD_ID,
    name:         item.name,
    expiry_date:  item.expiryDate ?? null,
    quantity:     item.quantity   ?? 1,
    category:     item.category   ?? 'Other',
    location:     item.location   ?? 'Fridge',
    image_url:    item.imageUrl   ?? null,
    added_at:     item.addedAt    ?? new Date().toISOString(),
  };
}

export function rowToGrocery(row) {
  return {
    id:      row.id,
    storeId: row.store_id,
    name:    row.name,
    checked: row.checked,
  };
}

export function groceryToRow(item, storeId) {
  return {
    id:           item.id,
    household_id: HOUSEHOLD_ID,
    store_id:     storeId,
    name:         item.name,
    checked:      item.checked ?? false,
    added_at:     new Date().toISOString(),
  };
}
