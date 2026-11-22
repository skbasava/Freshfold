import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle,
  CheckCircle2,
  HardDrive,
  Info,
  Loader2,
  Plus,
  ShieldCheck,
  User,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useOptionalAuth } from "@/features/auth";
import { apiFetch } from "@/lib/http/api-client";

/* Flaticon-style corporate laundry illustrations */
function HubBranchFlaticonIcon({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="6" y="16" width="36" height="26" rx="4" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2.5" />
      <path d="M4 16L24 5L44 16" stroke="#1D4ED8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="18" y="26" width="12" height="16" rx="2" fill="#2563EB" />
      <rect x="10" y="22" width="6" height="6" rx="1.5" fill="#93C5FD" />
      <rect x="32" y="22" width="6" height="6" rx="1.5" fill="#93C5FD" />
    </svg>
  );
}

function StaffUserFlaticonIcon({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="24" cy="16" r="8" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2.5" />
      <path d="M10 40C10 32.268 16.268 26 24 26C31.732 26 38 32.268 38 40" stroke="#1D4ED8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="36" cy="36" r="6" fill="#10B981" />
      <path d="M33.5 36L35 37.5L38.5 34" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GstTaxFlaticonIcon({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="8" y="6" width="32" height="38" rx="5" fill="#EFF6FF" stroke="#2563EB" strokeWidth="2.5" />
      <rect x="8" y="6" width="32" height="10" rx="5" fill="#2563EB" />
      <circle cx="31" cy="25" r="7.5" fill="#1D4ED8" />
      <text x="31" y="29" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="900" fontFamily="system-ui">%</text>
      <rect x="14" y="21" width="8" height="2.5" rx="1" fill="#38BDF8" />
      <rect x="14" y="27" width="10" height="2.5" rx="1" fill="#94A3B8" />
      <rect x="14" y="33" width="14" height="2.5" rx="1" fill="#94A3B8" />
      <circle cx="31" cy="38" r="4.5" fill="#10B981" />
      <path d="M29.5 38L30.8 39.3L32.8 36.8" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleCalendarFlaticon({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="6" y="8" width="36" height="34" rx="6" fill="#FFFFFF" stroke="#4285F4" strokeWidth="2.5" />
      <path d="M6 18H42V14C42 10.6863 39.3137 8 36 8H12C8.68629 8 6 10.6863 6 14V18Z" fill="#4285F4" />
      <rect x="14" y="4" width="4" height="8" rx="2" fill="#EA4335" />
      <rect x="30" y="4" width="4" height="8" rx="2" fill="#EA4335" />
      <text x="24" y="34" textAnchor="middle" fill="#4285F4" fontSize="13" fontWeight="bold" fontFamily="sans-serif">31</text>
    </svg>
  );
}

function DatabaseFlaticonIcon({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <ellipse cx="24" cy="12" rx="16" ry="6" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2.5" />
      <path d="M8 12V24C8 27.3137 15.1634 30 24 30C32.8366 30 40 27.3137 40 24V12" stroke="#2563EB" strokeWidth="2.5" />
      <path d="M8 24V36C8 39.3137 15.1634 42 24 42C32.8366 42 40 39.3137 40 36V24" stroke="#1D4ED8" strokeWidth="2.5" />
      <circle cx="34" cy="34" r="3" fill="#10B981" />
    </svg>
  );
}

export function SettingsPage() {
  const auth = useOptionalAuth();
  const user = auth?.session?.user;

  const [dbStatus, setDbStatus] = useState<string>("checking");
  const [foreignKeys, setForeignKeys] = useState<boolean>(true);

  // Indian GST Configuration State
  const [gstEnabled, setGstEnabled] = useState<boolean>(true);
  const [loadingGst, setLoadingGst] = useState<boolean>(true);
  const [savingGst, setSavingGst] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await apiFetch("/health/database");
        if (res.ok) {
          const body = (await res.json()) as {
            status: string;
            foreignKeysEnabled: boolean;
          };
          setDbStatus(body.status);
          setForeignKeys(body.foreignKeysEnabled);
        } else {
          setDbStatus("degraded");
        }
      } catch {
        setDbStatus("unavailable");
      }
    }

    async function loadGstSetting() {
      try {
        const res = await apiFetch("/api/v1/settings/gst");
        if (res.ok) {
          const body = (await res.json()) as { data: { enabled: boolean } };
          setGstEnabled(body.data?.enabled !== false);
        }
      } catch {
        // Fallback default is enabled
        setGstEnabled(true);
      } finally {
        setLoadingGst(false);
      }
    }

    void checkHealth();
    void loadGstSetting();
  }, []);

  const sessionHubs = auth?.session?.availableHubs && auth.session.availableHubs.length > 0
    ? auth.session.availableHubs
    : [
        {
          id: auth?.session?.user?.hubId ?? "MAIN",
          name: auth?.session?.user?.hubName ?? "FreshFold Main Branch",
          code: auth?.session?.user?.hubId ?? "MAIN",
          stateCode: "29",
          isDefault: true,
        },
      ];

  async function handleToggleGst(nextVal: boolean) {
    setSavingGst(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const res = await apiFetch("/api/v1/settings/gst", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextVal }),
      });

      if (res.ok) {
        setGstEnabled(nextVal);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        const errJson = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setErrorMessage(errJson?.error?.message ?? "Failed to save GST configuration");
      }
    } catch {
      setErrorMessage("Network error while updating GST configuration");
    } finally {
      setSavingGst(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Settings & Hub Master
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure branch operations, Indian GST tax rules, staff privileges, and Cloudflare D1 storage.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Hubs & Multi-Tenant Management Card */}
        <Card className="border border-border/80 bg-surface shadow-xs sm:col-span-2">
          <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <HubBranchFlaticonIcon className="size-6 shrink-0" />
              <div>
                <span>Hubs & Outlets</span>
                <p className="text-xs font-normal text-muted-foreground mt-0.5">
                  Tenant: <strong className="text-foreground">{auth?.session?.tenant?.name ?? "FreshFold India"}</strong> ({sessionHubs.length} Assigned Hub{sessionHubs.length === 1 ? "" : "s"})
                </p>
              </div>
            </CardTitle>
            <Badge variant="outline" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-200">
              Supabase Auth Managed
            </Badge>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {sessionHubs.map((hub) => (
                <div
                  key={hub.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 transition-all shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">{hub.name}</span>
                    <Badge variant={hub.isDefault ? "default" : "outline"} className="text-2xs font-semibold">
                      {hub.isDefault ? "Default Hub" : "Hub Outlet"}
                    </Badge>
                  </div>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Code:</span>
                      <span className="font-mono font-semibold text-foreground">{hub.code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>State Code:</span>
                      <span className="font-mono text-foreground">{hub.stateCode || "29"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Source:</span>
                      <span className="text-emerald-600 font-medium">Supabase Auth</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Staff Profile Card */}
        <Card className="border border-border/80 bg-surface shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <StaffUserFlaticonIcon className="size-6 shrink-0" />
              <span>Staff Identity & Permissions</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Display Name:</span>
              <span className="font-semibold text-foreground">
                {user?.displayName ?? "Priya Manager"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">Email:</span>
              <span className="text-foreground">{user?.email ?? "priya.manager@freshfold.in"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Assigned Role:</span>
              <Badge variant="default" className="text-[10px] font-medium capitalize">
                {user?.role ?? "manager"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Indian GST Taxation Card with Interactive Toggle Switch */}
        <Card className="border border-border/80 bg-surface shadow-xs sm:col-span-2">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                <GstTaxFlaticonIcon className="size-7 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <span>Indian GST & Tax Collection Master</span>
                    {loadingGst ? (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                  <p className="text-xs font-normal text-muted-foreground mt-0.5">
                    Toggle GST calculation on orders, quotes, and tax invoices
                  </p>
                </div>
              </CardTitle>

              {/* Status Indicator Badge */}
              <div className="flex items-center gap-2">
                {gstEnabled ? (
                  <Badge className="bg-blue-600 hover:bg-blue-600 text-white font-medium text-xs px-2.5 py-1">
                    GST Active (18% Tax Rate)
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-medium text-xs px-2.5 py-1">
                    Tax Exempt (0% GST - Small Business)
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-4 text-xs">
            {/* Toggle Switch Control Block */}
            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
                  <span>Charge GST on Counter Orders</span>
                  {savingGst ? (
                    <span className="flex items-center gap-1 text-xs text-blue-600 font-normal">
                      <Loader2 className="size-3 animate-spin" />
                      Saving to database...
                    </span>
                  ) : null}
                  {saveSuccess ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 className="size-3.5" />
                      Saved & Applied!
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-600">
                  {gstEnabled
                    ? "Currently charging 18% GST (CGST 9% + SGST 9% intra-state, IGST 18% inter-state) on all orders and receipts."
                    : "Currently TAX EXEMPT (0% GST). Customers are charged only the laundry service price without tax."}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                <label
                  htmlFor="gst-toggle-switch"
                  className="text-xs font-medium text-slate-700 cursor-pointer select-none"
                >
                  {gstEnabled ? "GST Enabled" : "GST Disabled"}
                </label>
                <Switch
                  id="gst-toggle-switch"
                  checked={gstEnabled}
                  disabled={loadingGst || savingGst}
                  onCheckedChange={handleToggleGst}
                />
              </div>
            </div>

            {/* Error Banner if update failed */}
            {errorMessage ? (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {/* Small Laundry Business Exemption Context Box */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/80 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <Info className="size-4 text-blue-600 shrink-0" />
                <span>Indian Small Laundry Business Exemption Policy</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Under Section 22 of the Central Goods and Services Tax (CGST) Act, service providers whose annual aggregate turnover does not exceed <strong>₹20 Lakhs</strong> (or <strong>₹10 Lakhs</strong> in Special Category States) are <em>not required to register for GST nor collect tax</em> from consumers.
              </p>
              <ul className="text-[11px] text-slate-600 list-disc list-inside space-y-1 pl-1">
                <li>
                  <strong>When Disabled (Turnover &lt; ₹20L):</strong> Subtotal equals Grand Total. POS quotes, order dockets, and invoices show 0% tax under exempt supply status.
                </li>
                <li>
                  <strong>When Enabled (Turnover ≥ ₹20L or voluntary registration):</strong> 18% GST is automatically calculated and split into CGST (9%) + SGST (9%) or IGST (18%).
                </li>
              </ul>
            </div>

            {/* HSN/SAC Master Rates Grid */}
            <div className="grid gap-3 sm:grid-cols-2 pt-1">
              <div className="p-3 rounded-lg border border-border/60 bg-canvas/40 space-y-1.5">
                <div className="flex justify-between items-center font-semibold text-foreground">
                  <span>Dry Cleaning Services</span>
                  <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded text-[11px]">
                    SAC 999712
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Suits, blazers, delicate fabrics, silks, lehengas, carpets.
                </p>
                <div className="flex justify-between text-[11px] pt-1 border-t border-border/40 font-medium">
                  <span className="text-slate-500">Effective Billing Rate:</span>
                  <span className={gstEnabled ? "text-blue-700 font-semibold" : "text-emerald-700 font-semibold"}>
                    {gstEnabled ? "18% GST (CGST 9% + SGST 9%)" : "0% (Tax Exempt)"}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border/60 bg-canvas/40 space-y-1.5">
                <div className="flex justify-between items-center font-semibold text-foreground">
                  <span>Laundry, Wash & Fold, Ironing</span>
                  <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded text-[11px]">
                    SAC 999711
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Everyday apparel, linens, towels, bedding, wash & iron.
                </p>
                <div className="flex justify-between text-[11px] pt-1 border-t border-border/40 font-medium">
                  <span className="text-slate-500">Effective Billing Rate:</span>
                  <span className={gstEnabled ? "text-blue-700 font-semibold" : "text-emerald-700 font-semibold"}>
                    {gstEnabled ? "18% GST (CGST 9% + SGST 9%)" : "0% (Tax Exempt)"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Google Calendar Shipping Projection Card */}
        <Card className="border border-border/80 bg-surface shadow-xs sm:col-span-2">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                <GoogleCalendarFlaticon className="size-7 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <span>Google Calendar Delivery & Shipping Projection</span>
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-medium text-xs px-2.5 py-0.5">
                      Auto-Sync Active
                    </Badge>
                  </div>
                  <p className="text-xs font-normal text-muted-foreground mt-0.5">
                    Orders automatically create a shipping calendar event on their promised delivery date
                  </p>
                </div>
              </CardTitle>
              <a
                href="https://calendar.google.com/calendar/u/0/r"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-2xs transition-colors self-start sm:self-auto no-underline"
              >
                <span>Open Google Calendar</span>
                <span className="text-xs">↗</span>
              </a>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/70 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Target Google Calendar</span>
                <p className="font-mono text-slate-800 text-[11px] truncate" title="09a863ccefb782f37206f51916f173b6f7eb50da0da2db4fee503865eb1a3415@group.calendar.google.com">
                  FreshFold Operations Calendar
                </p>
                <span className="text-[10px] text-muted-foreground block truncate">
                  09a863ccefb782f37206f51916f173b6f7eb50da0da2db4fee503865eb1a3415@group.calendar.google.com
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/70 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Authenticated Service Account</span>
                <p className="font-mono text-slate-800 text-[11px] truncate">
                  freshfold@freshfold-514416.iam.gserviceaccount.com
                </p>
                <span className="text-[10px] text-emerald-600 font-medium block">
                  ✓ Service Account JWT assertion (RS256)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/50 flex items-start gap-2 text-slate-700">
              <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                When staff creates an order at the POS counter with a delivery date, FreshFold calls the <strong>Google Calendar API</strong> to insert a shipping event with full delivery docket details, customer address, garment summary, and order amount. Staff and dispatch drivers can view and track deliveries directly on Google Calendar.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System & D1 Storage Health */}
        <Card className="border border-border/80 bg-surface shadow-xs sm:col-span-2">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <DatabaseFlaticonIcon className="size-6 shrink-0" />
              <span>System & Database Observability</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2.5 text-xs">
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Database Engine:</span>
                <span className="font-semibold text-foreground">Cloudflare D1 (SQLite)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Connection Status:</span>
                <Badge
                  variant={dbStatus === "ok" ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {dbStatus === "ok" ? "Operational" : dbStatus}
                </Badge>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Foreign Keys Enforcement:</span>
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle className="size-3" />
                  <span>PRAGMA foreign_keys = ON</span>
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Object Storage:</span>
                <span className="font-medium text-foreground">Cloudflare R2 (Active)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Architecture:</span>
                <span className="font-mono text-primary">Clean Architecture / Hono v4</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Identity & Roles:</span>
                <span className="font-mono text-emerald-700">Supabase Auth (JWT ES256)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
