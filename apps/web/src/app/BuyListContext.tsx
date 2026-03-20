"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface BuyListItem {
  id: string;         // `${printingId}-${storeName}`
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

interface BuyListContextValue {
  items: BuyListItem[];
  addItem: (item: BuyListItem) => void;
  removeItem: (id: string) => void;
  hasItem: (id: string) => boolean;
  clearAll: () => void;
  totalCount: number;
  totalPrice: number;
}

const BuyListContext = createContext<BuyListContextValue | null>(null);

const STORAGE_KEY = "scrymarket_buy_list";

export function BuyListProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BuyListItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage once on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // Migrate old items that may be missing newer fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(stored) as any[];
        setItems(parsed.map((item) => ({
          ...item,
          storeId: item.storeId ?? "",
          shippingAud: item.shippingAud ?? null,
        })));
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

  const addItem = useCallback((item: BuyListItem) => {
    setItems((prev: BuyListItem[]) => prev.some((i: BuyListItem) => i.id === item.id) ? prev : [...prev, item]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev: BuyListItem[]) => prev.filter((i: BuyListItem) => i.id !== id));
  }, []);

  const hasItem = useCallback((id: string) => {
    return items.some((i: BuyListItem) => i.id === id);
  }, [items]);

  const clearAll = useCallback(() => setItems([]), []);

  const totalPrice = items.reduce((sum: number, i: BuyListItem) => sum + i.priceAud, 0);

  return (
    <BuyListContext.Provider value={{ items, addItem, removeItem, hasItem, clearAll, totalCount: items.length, totalPrice }}>
      {children}
    </BuyListContext.Provider>
  );
}

export function useBuyList() {
  const ctx = useContext(BuyListContext);
  if (!ctx) throw new Error("useBuyList must be used within BuyListProvider");
  return ctx;
}
