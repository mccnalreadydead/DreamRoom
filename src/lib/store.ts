export type InventoryItem = {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  usedSell: number;
  retailPrice: number;
};

export type SaleLine = {
  id: string;
  dateISO: string;
  itemName: string;
  qty: number;
  salePrice: number;
  notes?: string;
};

export type TrackingEntry = {
  id: string;
  trackingNumber: string;
  datePurchasedISO?: string;
  contents?: string;
  cost?: number;
};

export type CalendarNote = {
  id: string;
  dateISO: string;
  note: string;
};

export type NewItemPrice = {
  id: string;
  product: string;
  price: number;
  retailPrice: number;
};

const K = {
  items: "ad_items_v1",
  sales: "ad_sales_v1",
  tracking: "ad_tracking_v1",
  calendar: "ad_calendar_v1",
  pricing: "ad_pricing_v1",
};

function uid() {
  // @ts-ignore
  return (crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`) as string;
}

function notify() {
  try {
    window.dispatchEvent(new Event("ad_store_updated"));
  } catch {
    // ignore
  }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  notify();
}

/** Inventory */
export function getItems(): InventoryItem[] {
  return readJSON<InventoryItem[]>(K.items, []);
}

export function setItems(items: InventoryItem[]) {
  writeJSON(K.items, items);
}

export function upsertItem(input: Omit<InventoryItem, "id"> & { id?: string }) {
  const items = getItems();
  const id = input.id ?? uid();
  const next: InventoryItem = { id, ...input };

  const idx = items.findIndex((x) => x.id === id);
  if (idx >= 0) items[idx] = next;
  else items.unshift(next);

  setItems(items);
}

export function adjustQtyByName(itemName: string, delta: number) {
  const items = getItems();
  const idx = items.findIndex((x) => x.name.toLowerCase() === itemName.toLowerCase());
  if (idx < 0) return;

  const current = Number(items[idx].qty) || 0;
  const nextQty = Math.max(0, current + delta);

  items[idx] = { ...items[idx], qty: nextQty };
  setItems(items);
}

/** Sales */
export function getSales(): SaleLine[] {
  return readJSON<SaleLine[]>(K.sales, []);
}

export function setSales(sales: SaleLine[]) {
  writeJSON(K.sales, sales);
}

export function addSale(line: Omit<SaleLine, "id">) {
  const sales = getSales();
  const full: SaleLine = { id: uid(), ...line };

  sales.unshift(full);
  setSales(sales);

  // Deduct inventory
  adjustQtyByName(full.itemName, -Math.abs(full.qty));
}

/** ✅ Delete a sale and restore inventory */
export function deleteSale(id: string) {
  const sales = getSales();
  const target = sales.find((s) => s.id === id);
  if (!target) return;

  const next = sales.filter((s) => s.id !== id);
  setSales(next);

  // Restore inventory (undo deduction)
  adjustQtyByName(target.itemName, Math.abs(target.qty));
}

/** Tracking */
export function getTracking(): TrackingEntry[] {
  return readJSON<TrackingEntry[]>(K.tracking, []);
}

export function setTracking(entries: TrackingEntry[]) {
  writeJSON(K.tracking, entries);
}

export function addTracking(entry: Omit<TrackingEntry, "id">) {
  const t = getTracking();
  t.unshift({ id: uid(), ...entry });
  setTracking(t);
}

/** ✅ Delete a tracking entry */
export function deleteTracking(id: string) {
  const t = getTracking();
  const next = t.filter((x) => x.id !== id);
  setTracking(next);
}

/** Calendar */
export function getCalendar(): CalendarNote[] {
  return readJSON<CalendarNote[]>(K.calendar, []);
}

export function setCalendar(notes: CalendarNote[]) {
  writeJSON(K.calendar, notes);
}

export function upsertCalendar(dateISO: string, note: string) {
  const notes = getCalendar();
  const idx = notes.findIndex((n) => n.dateISO === dateISO);

  if (idx >= 0) notes[idx] = { ...notes[idx], note };
  else notes.unshift({ id: uid(), dateISO, note });

  setCalendar(notes);
}

/** Pricing */
export function getPricing(): NewItemPrice[] {
  return readJSON<NewItemPrice[]>(K.pricing, []);
}

export function setPricing(rows: NewItemPrice[]) {
  writeJSON(K.pricing, rows);
}

/** Helpers */
export function excelSerialToISO(v: any): string | undefined {
  if (typeof v !== "number") return undefined;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = v * 24 * 60 * 60 * 1000;
  const d = new Date(epoch.getTime() + ms);
  return d.toISOString().slice(0, 10);
}
