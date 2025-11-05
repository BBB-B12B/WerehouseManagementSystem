import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AnalyticsOverview } from "./pages/AnalyticsOverview";
import { CatalogPage } from "./pages/CatalogPage";
import { LocationManager } from "./pages/LocationManager";
import { StoreOpsDashboard } from "./pages/StoreOpsDashboard";
import { WorkOrderPlanner } from "./pages/WorkOrderPlanner";

function App() {
  const envLabel = useMemo(() => {
    return (globalThis as { __APP_ENV__?: string }).__APP_ENV__ ?? "local";
  }, []);

  const queryClient = useMemo(() => new QueryClient(), []);
  const [activeTab, setActiveTab] =
    useState<"requester" | "storeops" | "locations" | "logistics" | "analytics">("requester");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold">WMS Material Request</h1>
                <p className="text-xs text-slate-500">
                  สภาพแวดล้อมปัจจุบัน: <strong>{envLabel}</strong>
                </p>
              </div>
            </div>
            <nav className="flex flex-wrap gap-2 text-sm">
              <TabButton
                label="โหมดขอวัสดุ"
                active={activeTab === "requester"}
                onClick={() => setActiveTab("requester")}
              />
              <TabButton
                label="โหมดคลังสินค้า"
                active={activeTab === "storeops"}
                onClick={() => setActiveTab("storeops")}
              />
              <TabButton
                label="จัดการ Location"
                active={activeTab === "locations"}
                onClick={() => setActiveTab("locations")}
              />
              <TabButton
                label="โหมดขนส่ง"
                active={activeTab === "logistics"}
                onClick={() => setActiveTab("logistics")}
              />
              <TabButton
                label="ภาพรวมองค์กร"
                active={activeTab === "analytics"}
                onClick={() => setActiveTab("analytics")}
              />
            </nav>
          </div>
        </header>

        <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
          {activeTab === "requester" ? <CatalogPage /> : null}
          {activeTab === "storeops" ? <StoreOpsDashboard /> : null}
          {activeTab === "locations" ? <LocationManager /> : null}
          {activeTab === "logistics" ? <WorkOrderPlanner /> : null}
          {activeTab === "analytics" ? <AnalyticsOverview /> : null}
        </main>
      </div>
    </QueryClientProvider>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 font-medium transition ${
        active ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

export default App;
