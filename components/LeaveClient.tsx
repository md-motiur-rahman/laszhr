"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type LeaveType =
  | "annual"
  | "sick"
  | "maternity"
  | "paternity"
  | "parental"
  | "bereavement"
  | "unpaid"
  | "study"
  | "compassionate"
  | "other";

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "annual", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
  { value: "maternity", label: "Maternity leave" },
  { value: "paternity", label: "Paternity leave" },
  { value: "parental", label: "Parental leave" },
  { value: "bereavement", label: "Bereavement leave" },
  { value: "unpaid", label: "Unpaid leave" },
  { value: "study", label: "Study leave" },
  { value: "compassionate", label: "Compassionate leave" },
  { value: "other", label: "Other" },
];

type BalanceRow = {
  company_id: string;
  employee_id: string;
  leave_type: LeaveType;
  period_start: string;
  period_end: string;
  total_entitled_days: number;
  taken_days: number;
  balance_days: number;
};

type RequestRow = {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  duration_days: number;
  reason: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
  decided_by_user_id: string | null;
  decided_at: string | null;
  created_at: string;
};

type EmpOption = { id: string; full_name: string; email: string | null };

type LeaveClientProps = {
  role: string | null;
  companyId: string | null;
  employeeId: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  initialEmployeeId?: string | null;
};

export default function LeaveClient({ role, companyId, employeeId, employeeName, employeeEmail, initialEmployeeId }: LeaveClientProps) {
  const isAdmin = role === "business_admin";

  // Data
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [empOptions, setEmpOptions] = useState<EmpOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(initialEmployeeId || null);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [adminSearch, setAdminSearch] = useState<string>("");

  // Add/Edit modal state
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm, setAddForm] = useState<Partial<RequestRow> & { employee_id?: string; leave_type?: LeaveType }>({ leave_type: "annual" });

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<RequestRow> & { id?: string }>({});

  const empNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of empOptions) m.set(e.id, e.full_name || e.email || e.id.slice(0, 6));
    return m;
  }, [empOptions]);

  useEffect(() => {
    setFilterEmployeeId(initialEmployeeId || null);
  }, [initialEmployeeId]);

  const monthRange = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const end = new Date(y, m, 0); // last day of month
    const startStr = `${y}-${String(m).padStart(2, "0")}-01`;
    const endStr = `${y}-${String(m).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    return { startStr, endStr };
  }, [selectedMonth]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      if (!companyId) {
        setRequests([]);
        setEmpOptions([]);
        setLoading(false);
        return;
      }

      // Requests: one table with all statuses; RLS will scope for employees
      let rq = supabase
        .from("leave_requests")
        .select("id, company_id, employee_id, leave_type, start_date, end_date, duration_days, reason, status, decided_by_user_id, decided_at, created_at")
        .eq("company_id", companyId)
        // Overlap current month: start_date <= monthEnd AND end_date >= monthStart
        .lte("start_date", monthRange.endStr)
        .gte("end_date", monthRange.startStr)
        .order("start_date", { ascending: true });
      if (isAdmin && filterEmployeeId) {
        rq = rq.eq("employee_id", filterEmployeeId);
      }
      const { data: reqData, error: reqErr } = await rq;
      if (reqErr) throw reqErr;

      // Employees for picker: admin sees all; employee only self
      if (isAdmin) {
        const { data: empData, error: empErr } = await supabase
          .from("employees")
          .select("id, full_name, email")
          .eq("company_id", companyId)
          .order("full_name", { ascending: true });
        if (empErr) throw empErr;
        setEmpOptions((empData as any) || []);
      } else if (employeeId) {
        const { data: me, error: meErr } = await supabase
          .from("employees")
          .select("id, full_name, email")
          .eq("id", employeeId)
          .maybeSingle();
        if (meErr) throw meErr;
        setEmpOptions(me ? [me as any] : []);
      } else {
        setEmpOptions([]);
      }

      // Balances for annual leave (for showing remaining balance on table)
      let balQ = supabase
        .from("leave_balances_v")
        .select("company_id, employee_id, leave_type, period_start, period_end, total_entitled_days, taken_days, balance_days")
        .eq("company_id", companyId)
        .eq("leave_type", "annual");
      if (isAdmin && filterEmployeeId) balQ = balQ.eq("employee_id", filterEmployeeId as string);
      else if (!isAdmin && employeeId) balQ = balQ.eq("employee_id", employeeId as string);
      const { data: balData, error: balErr } = await balQ;
      if (balErr) throw balErr;

      setBalances((balData as any) || []);
      setRequests((reqData as any) || []);
    } catch (e: any) {
      setError(e.message || "Failed to load leave data");
      setRequests([]);
      setEmpOptions([]);
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [companyId, employeeId, isAdmin, filterEmployeeId, monthRange.startStr, monthRange.endStr]);

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel("leave-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_entitlements" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

  function openAdd() {
    setError(null);
    // Employee cannot select another employee; prefill
    if (!isAdmin && employeeId) {
      setAddForm({ employee_id: employeeId, leave_type: "annual" });
    } else {
      setAddForm({ leave_type: "annual", employee_id: (filterEmployeeId || undefined) as any });
    }
    setAddOpen(true);
  }

  async function hasOverlap(empId: string, start: string, end: string, excludeId?: string) {
    // overlap if existing.start <= new.end AND existing.end >= new.start, and status in pending/approved
    let q = supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId as string)
      .eq("employee_id", empId)
      .in("status", ["pending", "approved"])
      .lte("start_date", end)
      .gte("end_date", start);
    if (excludeId) q = q.neq("id", excludeId);
    const { count, error } = await q;
    if (error) throw error;
    return (count || 0) > 0;
  }

  async function createLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setAddSaving(true);
    setError(null);
    try {
      const empId = (isAdmin ? addForm.employee_id : employeeId) as string;
      const start = addForm.start_date as string;
      const end = (addForm.end_date || addForm.start_date) as string;

      if (!empId || !start) throw new Error("Missing required fields");

      if (await hasOverlap(empId, start, end)) {
        throw new Error("Leave dates overlap with an existing pending/approved request.");
      }

      // Get current user for applicant_user_id (required by RLS policy)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload: any = {
        company_id: companyId,
        employee_id: empId,
        leave_type: addForm.leave_type,
        start_date: start,
        end_date: end,
        reason: addForm.reason || null,
        applicant_user_id: user.id,
      };
      const { error } = await supabase.from("leave_requests").insert(payload);
      if (error) throw error;
      setAddOpen(false);
      setAddForm({ leave_type: "annual" });
      await fetchData();
    } catch (e: any) {
      setError(e.message || "Failed to create leave");
    } finally {
      setAddSaving(false);
    }
  }

  function openEdit(r: RequestRow) {
    if (!isAdmin) return;
    setError(null);
    setEditForm({ id: r.id, employee_id: r.employee_id, leave_type: r.leave_type, start_date: r.start_date, end_date: r.end_date, reason: r.reason || "" });
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || !editForm.id) return;
    setEditSaving(true);
    setError(null);
    try {
      const empId = editForm.employee_id as string;
      const start = editForm.start_date as string;
      const end = (editForm.end_date || editForm.start_date) as string;

      if (await hasOverlap(empId, start, end, editForm.id)) {
        throw new Error("Leave dates overlap with an existing pending/approved request.");
      }

      const payload: any = {
        employee_id: empId,
        leave_type: editForm.leave_type,
        start_date: start,
        end_date: end,
        reason: editForm.reason || null,
      };
      const { error } = await supabase.from("leave_requests").update(payload).eq("id", editForm.id);
      if (error) throw error;
      setEditOpen(false);
      setEditForm({});
      await fetchData();
    } catch (e: any) {
      setError(e.message || "Failed to update leave");
    } finally {
      setEditSaving(false);
    }
  }

  async function approve(id: string) {
    if (!isAdmin) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("leave_requests")
        .update({ status: "approved", decided_at: new Date().toISOString(), decided_by_user_id: user?.id || null })
        .eq("id", id)
        .eq("status", "pending");
      if (error) throw error;
      await fetchData();
    } catch (e: any) {
      setError(e.message || "Failed to approve");
    }
  }

  async function deleteReq(id: string) {
    if (!isAdmin) return;
    try {
      const { error } = await supabase.from("leave_requests").delete().eq("id", id);
      if (error) throw error;
      await fetchData();
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    }
  }

  function getAnnualBalance(empId: string, date: string): number | string {
    const row = balances.find(
      (b) => b.employee_id === empId && b.leave_type === "annual" && b.period_start <= date && b.period_end >= date
    );
    return row ? row.balance_days : "—";
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "approved": return "bg-emerald-100 text-emerald-700";
      case "declined": return "bg-red-100 text-red-700";
      case "cancelled": return "bg-slate-100 text-slate-600";
      default: return "bg-amber-100 text-amber-800";
    }
  }

  const filteredRequests = useMemo(() => {
    if (isAdmin && adminSearch.trim()) {
      return requests.filter((r) => 
        (empNameById.get(r.employee_id) || "").toLowerCase().includes(adminSearch.toLowerCase())
      );
    }
    return requests;
  }, [requests, isAdmin, adminSearch, empNameById]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="w-full border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Leave</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-semibold text-slate-900">Leave Management</h1>
              <p className="mt-1 text-slate-600 text-sm hidden sm:block">Create and manage leave requests</p>
            </div>
            <button 
              onClick={openAdd} 
              className="w-full sm:w-auto inline-flex items-center justify-center h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium shadow-sm transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Request Leave
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            {/* Month navigation */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const [y, m] = selectedMonth.split("-").map(Number);
                  const d = new Date(y, (m - 1) - 1, 1);
                  setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                }}
                className="h-10 w-10 flex-shrink-0 rounded-lg border border-slate-200 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 transition-colors"
                title="Previous month"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="flex-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 min-w-0"
              />
              <button
                type="button"
                onClick={() => {
                  const [y, m] = selectedMonth.split("-").map(Number);
                  const d = new Date(y, (m - 1) + 1, 1);
                  setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                }}
                className="h-10 w-10 flex-shrink-0 rounded-lg border border-slate-200 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 transition-colors"
                title="Next month"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Search (admin only) */}
            {isAdmin && (
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  placeholder="Search employee..."
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
            )}

            {/* Filter badge */}
            {isAdmin && filterEmployeeId && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs rounded-full bg-indigo-50 text-indigo-700 px-3 py-1.5 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {empNameById.get(filterEmployeeId) || filterEmployeeId.slice(0,6)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">
              {filteredRequests.length} {filteredRequests.length === 1 ? "Request" : "Requests"}
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center gap-2 text-slate-500 text-sm">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-600 text-sm">No leave requests for this period</p>
              <button 
                onClick={openAdd}
                className="mt-3 text-indigo-600 text-sm font-medium hover:text-indigo-700"
              >
                Create your first request →
              </button>
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="divide-y divide-slate-100 sm:hidden">
                {filteredRequests.map((r) => (
                  <div key={r.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 truncate">
                          {empNameById.get(r.employee_id) || r.employee_id.slice(0, 6)}
                        </p>
                        <p className="text-xs text-slate-500 capitalize mt-0.5">{r.leave_type.replace("_", " ")} leave</p>
                      </div>
                      <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium flex-shrink-0 ${getStatusColor(r.status)}`}>
                        {r.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">From</p>
                        <p className="text-slate-900">{formatDate(r.start_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">To</p>
                        <p className="text-slate-900">{formatDate(r.end_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Duration</p>
                        <p className="text-slate-900">{r.duration_days} {r.duration_days === 1 ? "day" : "days"}</p>
                      </div>
                      {r.leave_type === "annual" && (
                        <div>
                          <p className="text-xs text-slate-500 mb-0.5">Balance</p>
                          <p className="text-slate-900">{getAnnualBalance(r.employee_id, r.start_date)} days</p>
                        </div>
                      )}
                    </div>

                    {r.reason && (
                      <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 mb-3">
                        {r.reason}
                      </p>
                    )}

                    {isAdmin && (
                      <div className="flex gap-2">
                        {r.status === "pending" && (
                          <button 
                            onClick={() => approve(r.id)} 
                            className="flex-1 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-medium transition-colors"
                          >
                            Approve
                          </button>
                        )}
                        <button 
                          onClick={() => openEdit(r)} 
                          className="flex-1 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => deleteReq(r.id)} 
                          className="h-9 w-9 flex-shrink-0 rounded-lg border border-red-200 bg-white hover:bg-red-50 active:bg-red-100 text-red-600 flex items-center justify-center transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Employee</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Period</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Type</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Days</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Balance</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Status</th>
                      {isAdmin && <th className="text-right py-3 px-4 font-medium text-slate-600">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{empNameById.get(r.employee_id) || r.employee_id.slice(0, 6)}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="whitespace-nowrap">{formatDate(r.start_date)}</span>
                          <span className="mx-1">→</span>
                          <span className="whitespace-nowrap">{formatDate(r.end_date)}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 capitalize">{r.leave_type.replace("_", " ")}</td>
                        <td className="py-3 px-4 text-slate-900 font-medium">{r.duration_days}</td>
                        <td className="py-3 px-4 text-slate-600">
                          {r.leave_type === "annual" ? getAnnualBalance(r.employee_id, r.start_date) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium ${getStatusColor(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              {r.status === "pending" && (
                                <button 
                                  onClick={() => approve(r.id)} 
                                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                                >
                                  Approve
                                </button>
                              )}
                              <button 
                                onClick={() => openEdit(r)} 
                                className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => deleteReq(r.id)} 
                                className="h-8 px-3 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-medium transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-500 px-1">
          Annual leave consumes from your entitlement upon approval.
        </p>
      </main>

      {/* Add leave modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal header */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Request Leave</h2>
                <p className="text-xs text-slate-500 mt-0.5">New requests require approval</p>
              </div>
              <button 
                onClick={() => setAddOpen(false)} 
                className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={createLeave} className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                {/* Employee */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee</label>
                  {!isAdmin && employeeId ? (
                    <div className="w-full h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center text-sm text-slate-700">
                      {employeeName || empNameById.get(employeeId) || "You"}
                    </div>
                  ) : (
                    <select
                      required
                      value={addForm.employee_id || ""}
                      onChange={(e) => setAddForm({ ...addForm, employee_id: e.target.value })}
                      className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="" disabled>Select employee</option>
                      {empOptions.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name}{emp.email ? ` — ${emp.email}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Leave type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Leave Type</label>
                  <select 
                    required 
                    value={addForm.leave_type as any} 
                    onChange={(e) => setAddForm({ ...addForm, leave_type: e.target.value as LeaveType })} 
                    className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  >
                    {LEAVE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">From</label>
                    <input 
                      required 
                      type="date" 
                      value={addForm.start_date || ""} 
                      onChange={(e) => setAddForm({ ...addForm, start_date: e.target.value })} 
                      className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">To</label>
                    <input 
                      type="date" 
                      value={addForm.end_date || ""} 
                      onChange={(e) => setAddForm({ ...addForm, end_date: e.target.value })} 
                      className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900" 
                    />
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason (optional)</label>
                  <textarea 
                    value={addForm.reason || ""} 
                    onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })} 
                    rows={3}
                    placeholder="Add any notes..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 resize-none" 
                  />
                </div>
              </div>

              {/* Modal footer */}
              <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
                <button 
                  type="button" 
                  onClick={() => setAddOpen(false)}
                  className="w-full sm:w-auto h-11 px-5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={addSaving || (!isAdmin && !employeeId) || (isAdmin && !addForm.employee_id) || !addForm.start_date}
                  className="w-full sm:flex-1 h-11 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
                >
                  {addSaving ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit leave modal (admin only) */}
      {isAdmin && editOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal header */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Edit Leave Request</h2>
                <p className="text-xs text-slate-500 mt-0.5">Update request details</p>
              </div>
              <button 
                onClick={() => setEditOpen(false)} 
                className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={saveEdit} className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                {/* Employee */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee</label>
                  <select
                    required
                    value={editForm.employee_id || ""}
                    onChange={(e) => setEditForm({ ...editForm, employee_id: e.target.value })}
                    className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  >
                    {empOptions.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}{emp.email ? ` — ${emp.email}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Leave type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Leave Type</label>
                  <select 
                    required 
                    value={editForm.leave_type as any} 
                    onChange={(e) => setEditForm({ ...editForm, leave_type: e.target.value as any })} 
                    className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  >
                    {LEAVE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">From</label>
                    <input 
                      required 
                      type="date" 
                      value={editForm.start_date || ""} 
                      onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} 
                      className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">To</label>
                    <input 
                      type="date" 
                      value={editForm.end_date || ""} 
                      onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} 
                      className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900" 
                    />
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason (optional)</label>
                  <textarea 
                    value={editForm.reason || ""} 
                    onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} 
                    rows={3}
                    placeholder="Add any notes..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 resize-none" 
                  />
                </div>
              </div>

              {/* Modal footer */}
              <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
                <button 
                  type="button" 
                  onClick={() => setEditOpen(false)}
                  className="w-full sm:w-auto h-11 px-5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={editSaving}
                  className="w-full sm:flex-1 h-11 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
