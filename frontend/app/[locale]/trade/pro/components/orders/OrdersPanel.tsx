"use client";

import React, { memo, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { cn } from "../../utils/cn";
import { OpenOrdersTab } from "./OpenOrdersTab";
import { OrderHistoryTab } from "./OrderHistoryTab";
import { TradeHistoryTab, type Trade } from "./TradeHistoryTab";
import type { OrderFiltersState } from "./OrderFilters";
import type { Order } from "./OrderRow";
import type { MarketType } from "../../types/common";
import { $fetch } from "@/lib/api";
import { useUserStore } from "@/store/user";

// Module-level cache to persist across StrictMode remounts
const ordersPanelCache = {
  lastFetchTime: 0,
  fetchInProgress: false,
  data: null as { orders: Order[]; trades: Trade[] } | null,
};

// Cooldown to prevent StrictMode double-fetch (2 seconds)
const FETCH_COOLDOWN_MS = 2000;

interface MarketMetadata {
  precision?: {
    price?: number;
    amount?: number;
  };
}

interface OrdersPanelProps {
  symbol: string;
  marketType: MarketType;
  className?: string;
  compact?: boolean;
  metadata?: MarketMetadata;
}

type TabType = "open" | "history" | "trades";

export const OrdersPanel = memo(function OrdersPanel({
  symbol,
  marketType,
  className,
  compact = false,
  metadata,
}: OrdersPanelProps) {
  // Get user authentication status
  const user = useUserStore((state) => state.user);
  const isAuthenticated = !!user;

  const [activeTab, setActiveTab] = useState<TabType>("open");
  const [orders, setOrders] = useState<Order[]>(ordersPanelCache.data?.orders || []);
  const [trades, setTrades] = useState<Trade[]>(ordersPanelCache.data?.trades || []);
  const [isLoading, setIsLoading] = useState(!ordersPanelCache.data);
  const [filters, setFilters] = useState<OrderFiltersState>({
    symbol: "",
    side: "",
    hideOther: true,
  });

  // Refs to track state without causing re-renders
  const isMountedRef = useRef(true);
  const currentSymbolRef = useRef(symbol);
  const currentMarketTypeRef = useRef(marketType);

  // Update refs when props change
  currentSymbolRef.current = symbol;
  currentMarketTypeRef.current = marketType;

  // Determine API endpoint based on market type
  const getApiEndpoint = useCallback((path: string, mType: MarketType) => {
    if (mType === "futures") return `/api/futures/${path}`;
    if (mType === "eco") return `/api/ecosystem/${path}`;
    return `/api/exchange/${path}`;
  }, []);

  // Fetch all order data - uses module-level cache to prevent StrictMode double-fetch
  const fetchAllData = useCallback(async (force = false) => {
    // Don't fetch orders if user is not authenticated
    if (!isAuthenticated) {
      setOrders([]);
      setTrades([]);
      setIsLoading(false);
      return;
    }

    const now = Date.now();

    // Prevent duplicate fetches - check module-level cache unless forced
    if (!force && (ordersPanelCache.fetchInProgress || now - ordersPanelCache.lastFetchTime < FETCH_COOLDOWN_MS)) {
      // If we have cached data, use it
      if (ordersPanelCache.data) {
        setOrders(ordersPanelCache.data.orders);
        setTrades(ordersPanelCache.data.trades);
        setIsLoading(false);
      }
      return;
    }

    if (!isMountedRef.current) return;

    ordersPanelCache.fetchInProgress = true;
    ordersPanelCache.lastFetchTime = now;
    setIsLoading(true);

    try {
      // Use current values from refs
      const sym = currentSymbolRef.current;
      const mType = currentMarketTypeRef.current;

      // Parse symbol for query params
      const [currency, pair] = sym.split("/");

      // Fetch open and closed orders in parallel
      const [openResult, closedResult] = await Promise.all([
        $fetch<any>({
          url: `${getApiEndpoint("order", mType)}?type=OPEN&currency=${currency}&pair=${pair}`,
          method: "GET",
          silent: true,
        }),
        $fetch<any>({
          url: `${getApiEndpoint("order", mType)}?type=CLOSED&currency=${currency}&pair=${pair}`,
          method: "GET",
          silent: true,
        }),
      ]);

      if (isMountedRef.current) {
        const allOrders: Order[] = [];

        // Process open orders
        if (!openResult.error && openResult.data) {
          const openOrders = Array.isArray(openResult.data) ? openResult.data : openResult.data.data || [];
          openOrders.forEach((o: any) => {
            allOrders.push({
              id: o.id || o.orderId,
              symbol: o.symbol,
              side: o.side?.toUpperCase() || "BUY",
              type: o.type?.toUpperCase() || "LIMIT",
              price: o.price,
              amount: o.amount,
              filled: o.filled || 0,
              remaining: o.remaining || o.amount - (o.filled || 0),
              status: o.status?.toUpperCase() || "OPEN",
              createdAt: o.createdAt || o.created_at || new Date().toISOString(),
              updatedAt: o.updatedAt || o.updated_at || new Date().toISOString(),
            });
          });
        }

        // Process closed orders (history)
        const closedOrders: any[] = [];
        if (!closedResult.error && closedResult.data) {
          const historyOrders = Array.isArray(closedResult.data) ? closedResult.data : closedResult.data.data || [];
          historyOrders.forEach((o: any) => {
            closedOrders.push(o);
            // Don't add duplicates to allOrders
            if (!allOrders.find((existing) => existing.id === (o.id || o.orderId))) {
              allOrders.push({
                id: o.id || o.orderId,
                symbol: o.symbol,
                side: o.side?.toUpperCase() || "BUY",
                type: o.type?.toUpperCase() || "LIMIT",
                price: o.price,
                amount: o.amount,
                filled: o.filled || 0,
                remaining: o.remaining || 0,
                status: o.status?.toUpperCase() || "FILLED",
                createdAt: o.createdAt || o.created_at || new Date().toISOString(),
                updatedAt: o.updatedAt || o.updated_at || new Date().toISOString(),
              });
            }
          });
        }

        // Convert filled orders to trade format
        const formattedTrades: Trade[] = closedOrders
          .filter((o: any) => o.status === "FILLED" || o.status === "PARTIALLY_FILLED")
          .map((o: any) => ({
            id: o.id || o.orderId,
            orderId: o.id || o.orderId,
            symbol: o.symbol,
            side: o.side?.toUpperCase() || "BUY",
            price: o.price,
            amount: o.filled || o.amount,
            fee: o.fee || 0,
            feeCurrency: o.feeCurrency || o.fee_currency || "USDT",
            timestamp: o.updatedAt || o.updated_at || o.createdAt || new Date().toISOString(),
          }));

        // Update module-level cache
        ordersPanelCache.data = { orders: allOrders, trades: formattedTrades };

        setOrders(allOrders);
        setTrades(formattedTrades);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      ordersPanelCache.fetchInProgress = false;
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [getApiEndpoint, isAuthenticated]);

  // Initial fetch on mount only
  useEffect(() => {
    isMountedRef.current = true;

    // Only fetch if not already fetched recently (handles StrictMode)
    fetchAllData();

    return () => {
      isMountedRef.current = false;
    };
  }, []); // Empty dependency - only run on mount

  // Listen for order updates from WebSocket events
  useEffect(() => {
    const handleOrderUpdate = () => {
      // Force refetch on order updates
      fetchAllData(true);
    };

    window.addEventListener("tp-order-updated", handleOrderUpdate);
    window.addEventListener("order-placed", handleOrderUpdate);

    return () => {
      window.removeEventListener("tp-order-updated", handleOrderUpdate);
      window.removeEventListener("order-placed", handleOrderUpdate);
    };
  }, [fetchAllData]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filters.hideOther && order.symbol !== symbol) return false;
      if (filters.symbol && !order.symbol.includes(filters.symbol.toUpperCase())) return false;
      if (filters.side && order.side !== filters.side) return false;
      return true;
    });
  }, [orders, filters, symbol]);

  const openOrders = useMemo(() => {
    return filteredOrders.filter((o) => o.status === "OPEN" || o.status === "PARTIALLY_FILLED");
  }, [filteredOrders]);

  const orderHistory = useMemo(() => {
    return filteredOrders.filter((o) => o.status !== "OPEN" && o.status !== "PARTIALLY_FILLED");
  }, [filteredOrders]);

  // Filter trades
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      if (filters.hideOther && trade.symbol !== symbol) return false;
      if (filters.symbol && !trade.symbol.includes(filters.symbol.toUpperCase())) return false;
      if (filters.side && trade.side !== filters.side) return false;
      return true;
    });
  }, [trades, filters, symbol]);

  // Cancel order
  const handleCancel = useCallback(async (orderId: string, createdAt: string) => {
    try {
      const mType = currentMarketTypeRef.current;
      let endpoint = `${getApiEndpoint("order", mType)}/${orderId}`;

      // Ecosystem and futures require timestamp query parameter
      if (mType === "eco" || mType === "futures") {
        // Convert ISO date to timestamp if needed
        const timestamp = new Date(createdAt).getTime();
        endpoint += `?timestamp=${timestamp}`;
      }

      const { error } = await $fetch({
        url: endpoint,
        method: "DELETE",
        silent: true,
      });

      if (error) {
        console.error("Failed to cancel order:", error);
        return;
      }

      // Update local state on success
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: "CANCELLED" as const } : o
        )
      );

      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent("tp-order-updated"));
    } catch (err) {
      console.error("Failed to cancel order:", err);
    }
  }, [getApiEndpoint]);

  // Modify order
  const handleModify = useCallback(async (orderId: string, updates: Partial<Order>) => {
    // In real implementation, call API
    console.log("Modify order", orderId, updates);
  }, []);

  // Cancel all open orders
  const handleCancelAll = useCallback(async () => {
    const openOrders = orders.filter(
      (o) => o.status === "OPEN" || o.status === "PARTIALLY_FILLED"
    );

    if (openOrders.length === 0) return;

    try {
      const mType = currentMarketTypeRef.current;

      // Check if there's a bulk cancel endpoint
      if (mType === "eco") {
        // Ecosystem has a bulk cancel endpoint
        const { error } = await $fetch({
          url: "/api/ecosystem/order/all",
          method: "DELETE",
          silent: true,
        });

        if (error) {
          console.error("Failed to cancel all orders:", error);
          return;
        }
      } else if (mType === "futures") {
        // Futures has a bulk cancel endpoint
        const { error } = await $fetch({
          url: "/api/futures/order/all",
          method: "DELETE",
          silent: true,
        });

        if (error) {
          console.error("Failed to cancel all orders:", error);
          return;
        }
      } else {
        // For exchange, cancel one by one (no timestamp needed)
        await Promise.all(
          openOrders.map((order) =>
            $fetch({
              url: `${getApiEndpoint("order", mType)}/${order.id}`,
              method: "DELETE",
              silent: true,
            })
          )
        );
      }

      // Update local state on success
      setOrders((prev) =>
        prev.map((o) =>
          o.status === "OPEN" || o.status === "PARTIALLY_FILLED"
            ? { ...o, status: "CANCELLED" as const }
            : o
        )
      );

      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent("tp-order-updated"));
    } catch (err) {
      console.error("Failed to cancel all orders:", err);
    }
  }, [orders, getApiEndpoint]);

  return (
    <div className={cn("tp-orders-panel flex flex-col h-full bg-[var(--tp-bg-secondary)]", className)}>
      {/* Compact header: Symbol + Side filter + Tabs + Actions */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--tp-border)]">
        {/* Symbol indicator */}
        <span className="text-[10px] font-medium text-[var(--tp-text-secondary)] bg-[var(--tp-bg-tertiary)] px-1.5 py-0.5 rounded">
          {symbol}
        </span>

        {/* Side filter dropdown */}
        <select
          value={filters.side}
          onChange={(e) => setFilters((prev) => ({ ...prev, side: e.target.value }))}
          className={cn(
            "px-1.5 py-0.5",
            "text-[10px]",
            "bg-[var(--tp-bg-tertiary)]",
            "border border-[var(--tp-border)]",
            "rounded",
            "text-[var(--tp-text-secondary)]",
            "outline-none focus:border-[var(--tp-blue)]",
            "cursor-pointer"
          )}
        >
          <option value="">All</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 flex-1">
          <TabButton
            active={activeTab === "open"}
            onClick={() => setActiveTab("open")}
            count={openOrders.length}
          >
            Open
          </TabButton>
          <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")}>
            History
          </TabButton>
          <TabButton active={activeTab === "trades"} onClick={() => setActiveTab("trades")}>
            Trades
          </TabButton>
        </div>

        {/* Cancel All button */}
        {openOrders.length > 0 && (
          <button
            onClick={handleCancelAll}
            className="text-[10px] text-[var(--tp-red)] hover:text-[var(--tp-red)]/80 px-1.5 py-0.5 rounded hover:bg-[var(--tp-red)]/10"
          >
            Cancel All
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "open" && (
          <OpenOrdersTab
            orders={openOrders}
            isLoading={isLoading}
            onCancel={handleCancel}
            onModify={handleModify}
            showSymbol={!filters.hideOther}
            pricePrecision={metadata?.precision?.price}
            amountPrecision={metadata?.precision?.amount}
          />
        )}
        {activeTab === "history" && (
          <OrderHistoryTab
            orders={orderHistory}
            isLoading={isLoading}
            pricePrecision={metadata?.precision?.price}
            amountPrecision={metadata?.precision?.amount}
          />
        )}
        {activeTab === "trades" && (
          <TradeHistoryTab
            trades={filteredTrades}
            isLoading={isLoading}
            pricePrecision={metadata?.precision?.price}
            amountPrecision={metadata?.precision?.amount}
          />
        )}
      </div>
    </div>
  );
});

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}

function TabButton({ active, onClick, children, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-1.5 py-0.5",
        "text-[10px] font-medium",
        "rounded",
        "transition-colors",
        active
          ? "text-[var(--tp-text-primary)] bg-[var(--tp-bg-elevated)]"
          : "text-[var(--tp-text-muted)] hover:text-[var(--tp-text-secondary)]"
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="ml-1 px-1 text-[9px] bg-[var(--tp-blue)]/20 text-[var(--tp-blue)] rounded">
          {count}
        </span>
      )}
    </button>
  );
}

export default OrdersPanel;
