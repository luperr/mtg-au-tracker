"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface WantListItem {
  id: string;         // `${printingId}-${storeId}-${url ?? ""}` — unique per distinct listing
  cardId: string;
  cardSlug: string | null;
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
  storeShippingOverrides: Record<string, number>;
  setStoreShipping: (storeId: string, amount: number | null) => void;
}

const WantListContext = createContext<WantListContextValue | null>(null);

const STORAGE_KEY = "scrymarket_buy_list"; // keep old key to preserve saved data
const SHIPPING_KEY = "scrymarket_shipping_overrides";

export function WantListProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WantListItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [storeShippingOverrides, setStoreShippingOverrides] = useState<Record<string, number>>({});

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
            cardSlug: item.cardSlug ?? null,
            shippingAud: item.shippingAud ?? null,
          };
        }));
      }
      const storedShipping = localStorage.getItem(SHIPPING_KEY);
      if (storedShipping) {
        setStoreShippingOverrides(JSON.parse(storedShipping));
      }
    } catch {
      // ignore parse errors
    }
    setHydrated(true);
  }, []);

  // Persist items to localStorage whenever they change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore quota errors
    }
  }, [items, hydrated]);

  // Persist shipping overrides whenever they change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SHIPPING_KEY, JSON.stringify(storeShippingOverrides));
    } catch {
      // ignore quota errors
    }
  }, [storeShippingOverrides, hydrated]);

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

  const setStoreShipping = useCallback((storeId: string, amount: number | null) => {
    setStoreShippingOverrides((prev: Record<string, number>) => {
      const next = { ...prev };
      if (amount === null) {
        delete next[storeId];
      } else {
        next[storeId] = amount;
      }
      return next;
    });
  }, []);

  const totalPrice = items.reduce((sum: number, i: WantListItem) => sum + i.priceAud, 0);

  return (
    <WantListContext.Provider value={{
      items, addItem, removeItem, hasItem, clearAll,
      totalCount: items.length, totalPrice,
      storeShippingOverrides, setStoreShipping,
    }}>
      {children}
    </WantListContext.Provider>
  );
}

export function useWantList() {
  const ctx = useContext(WantListContext);
  if (!ctx) throw new Error("useWantList must be used within WantListProvider");
  return ctx;
}
