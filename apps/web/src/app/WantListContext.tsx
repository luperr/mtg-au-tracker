"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface WantListItem {
  id: string;         // `${printingId}-${storeId}-${url ?? ""}` — unique per distinct listing
  cardId: string;
  cardName: string;
  printingId: string;
  setName: string;
  setCode: string;
  rarity: string;
  isFoil: boolean;
  storeId: string;
  storeName: string;
  priceAud: number;
  shippingAud: number | null;
  condition: string | null;
  url: string | null;
  imageUri: string | null;
}

interface WantListContextValue {
  items: WantListItem[];
  addItem: (item: WantListItem) => void;
  removeItem: (id: string) => void;
  hasItem: (id: string) => boolean;
  clearAll: () => void;
  totalCount: number;
  totalPrice: number;
}

const WantListContext = createContext<WantListContextValue | null>(null);

const STORAGE_KEY = "scrymarket_buy_list"; // keep old key to preserve saved data

export function WantListProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WantListItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage once on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // Migrate old items that may be missing newer fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(stored) as any[];
        setItems(parsed.map((item) => {
          const storeId = item.storeId ?? "";
          // Migrate old ID format (${printingId}-${storeName}) to new (${printingId}-${storeId}-${url})
          const id = `${item.printingId}-${storeId}-${item.url ?? ""}`;
          return {
            ...item,
            id,
            storeId,
            shippingAud: item.shippingAud ?? null,
          };
        }));
      }
    } catch {
      // ignore parse errors
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage whenever items change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore quota errors
    }
  }, [items, hydrated]);

  const addItem = useCallback((item: WantListItem) => {
    setItems((prev: WantListItem[]) => prev.some((i: WantListItem) => i.id === item.id) ? prev : [...prev, item]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev: WantListItem[]) => prev.filter((i: WantListItem) => i.id !== id));
  }, []);

  const hasItem = useCallback((id: string) => {
    return items.some((i: WantListItem) => i.id === id);
  }, [items]);

  const clearAll = useCallback(() => setItems([]), []);

  const totalPrice = items.reduce((sum: number, i: WantListItem) => sum + i.priceAud, 0);

  return (
    <WantListContext.Provider value={{ items, addItem, removeItem, hasItem, clearAll, totalCount: items.length, totalPrice }}>
      {children}
    </WantListContext.Provider>
  );
}

export function useWantList() {
  const ctx = useContext(WantListContext);
  if (!ctx) throw new Error("useWantList must be used within WantListProvider");
  return ctx;
}
