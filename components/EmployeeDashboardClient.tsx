"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type Shift = {
  id: string;
  start_time: string;
  end_time: string;
  department: string | null;
  role: string | null;
  location: string | null;
  break_minutes: number;
};

type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  status: string;
};

type LeaveBalance = {
  leave_type: string;
  total_entitled_days: number;
  taken_days: number;
  balance_days: number;
};

export type EmployeeDashboardData = {
  employeeId: string | null;
  companyId: string | null;
  employeeName: string | null;
  companyName: string | null;
  department: string | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

function getStatusColor(status: string) {
  switch (status) {
    case "approved": return "bg-emerald-100 text-emerald-700";
    case "pending": return "bg-amber-100 text-amber-700";
    case "declined": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function EmployeeDashboardClient({ initial }: { initial: EmployeeDashboardData }) {
  const [upcomingShifts, setUpcomingShifts] = useState<Shift[]>([]);
  const [recentLeave, setRecentLeave] = useState<LeaveRequest[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayShift, setTodayShift] = useState<Shift | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!initial.employeeId || !initial.companyId) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      // Fetch today's shift
      const { data: todayShiftData } = await supabase
        .from("shifts")
        .select("id, start_time, end_time, department, role, location, break_minutes")
        .eq("employee_id", initial.employeeId)
        .gte("start_time", todayStart.toISOString())
        .lt("start_time", todayEnd.toISOString())
        .order("start_time", { ascending: true })
        .limit(1);

      if (todayShiftData && todayShiftData.length > 0) {
        setTodayShift(todayShiftData[0] as Shift);
      }

      // Fetch upcoming shifts (next 7 days, excluding today)
      const weekEnd = new Date(todayEnd);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const { data: shiftsData } = await supabase
        .from("shifts")
        .select("id, start_time, end_time, department, role, location, break_minutes")
        .eq("employee_id", initial.employeeId)
        .gte("start_time", todayEnd.toISOString())
        .lt("start_time", weekEnd.toISOString())
        .order("start_time", { ascending: true })
        .limit(5);

      setUpcomingShifts((shiftsData as Shift[]) || []);

      // Fetch recent leave requests
      const { data: leaveData } = await supabase
        .from("leave_requests")
        .select("id, leave_type, start_date, end_date, duration_days, status")
        .eq("employee_id", initial.employeeId)
        .order("created_at", { ascending: false })
        .limit(3);

      setRecentLeave((leaveData as LeaveRequest[]) || []);

      // Fetch leave balance
      const { data: balanceData } = await supabase
        .from("leave_balances_v")
        .select("leave_type, total_entitled_days, taken_days, balance_days")
        .eq("employee_id", initial.employeeId)
        .eq("leave_type", "annual")
        .maybeSingle();

      setLeaveBalance(balanceData as LeaveBalance | null);

      setLoading(false);
    }

    fetchData();
  }, [initial.employeeId, initial.companyId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!initial.employeeId || !initial.companyId) return;

    const channel = supabase
      .channel("employee-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts", filter: `employee_id=eq.${initial.employeeId}` },
        () => {
          // Refetch shifts
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const weekEnd = new Date(todayStart);
          weekEnd.setDate(weekEnd.getDate() + 8);

          supabase
            .from("shifts")
            .select("id, start_time, end_time, department, role, location, break_minutes")
            .eq("employee_id", initial.employeeId!)
            .gte("start_time", todayStart.toISOString())
            .lt("start_time", weekEnd.toISOString())
            .order("start_time", { ascending: true })
            .limit(6)
            .then(({ data }) => {
              if (data) {
                const todayEnd = new Date(todayStart);
                todayEnd.setDate(todayEnd.getDate() + 1);
                const today = data.find(s => new Date(s.start_time) < todayEnd);
                const upcoming = data.filter(s => new Date(s.start_time) >= todayEnd).slice(0, 5);
                setTodayShift(today as Shift || null);
                setUpcomingShifts(upcoming as Shift[]);
              }
            });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests", filter: `employee_id=eq.${initial.employeeId}` },
        () => {
          supabase
            .from("leave_requests")
            .select("id, leave_type, start_date, end_date, duration_days, status")
            .eq("employee_id", initial.employeeId!)
            .order("created_at", { ascending: false })
            .limit(3)
            .then(({ data }) => setRecentLeave((data as LeaveRequest[]) || []));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initial.employeeId, initial.companyId]);

  const firstName = initial.employeeName?.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section - Mobile optimized */}
      <section className="bg-linear-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white">
        <div className="px-4 py-6 md:px-6 md:py-8">
          <p className="text-indigo-200 text-sm">{getGreeting()}</p>
          <h1 className="mt-1 text-2xl md:text-3xl font-bold">{firstName} 👋</h1>
          <p className="mt-1 text-indigo-200 text-sm">{initial.companyName}</p>

          {/* Today's Shift Card */}
          {loading ? (
            <div className="mt-6 bg-white/10 backdrop-blur rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-white/20 rounded w-24 mb-3"></div>
              <div className="h-6 bg-white/20 rounded w-32"></div>
            </div>
          ) : todayShift ? (
            <div className="mt-6 bg-white/10 backdrop-blur rounded-2xl p-4">
              <div className="flex items-center gap-2 text-indigo-200 text-sm mb-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Today's Shift
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{formatTime(todayShift.start_time)}</span>
                <span className="text-indigo-200">—</span>
                <span className="text-2xl font-bold">{formatTime(todayShift.end_time)}</span>
              </div>
              {(todayShift.location || todayShift.role) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {todayShift.location && (
                    <span className="inline-flex items-center gap-1 text-xs bg-white/20 rounded-full px-2 py-1">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {todayShift.location}
                    </span>
                  )}
                  {todayShift.role && (
                    <span className="inline-flex items-center gap-1 text-xs bg-white/20 rounded-full px-2 py-1">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 7h-9" />
                        <path d="M14 17H5" />
                        <circle cx="17" cy="17" r="3" />
                        <circle cx="7" cy="7" r="3" />
                      </svg>
                      {todayShift.role}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6 bg-white/10 backdrop-blur rounded-2xl p-4">
              <div className="flex items-center gap-2 text-indigo-200 text-sm mb-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Today
              </div>
              <p className="text-lg font-medium">No shift scheduled</p>
              <p className="text-indigo-200 text-sm mt-1">Enjoy your day off! 🎉</p>
            </div>
          )}
        </div>
      </section>

      {/* Quick Actions - Mobile Grid */}
      <section className="px-4 -mt-4 relative z-10 md:px-6">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/rota"
            className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:scale-[0.98] transition-transform"
          >
            <div className="h-10 w-10 rounded-lg bg-indigo-100 grid place-items-center mb-3">
              <svg className="h-5 w-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="font-semibold text-slate-900">My Rota</p>
            <p className="text-xs text-slate-500 mt-0.5">View schedule</p>
          </Link>

          <Link
            href="/leave"
            className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:scale-[0.98] transition-transform"
          >
            <div className="h-10 w-10 rounded-lg bg-emerald-100 grid place-items-center mb-3">
              <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <p className="font-semibold text-slate-900">Request Leave</p>
            <p className="text-xs text-slate-500 mt-0.5">Book time off</p>
          </Link>
        </div>
      </section>

      {/* Leave Balance Card */}
      {leaveBalance && (
        <section className="px-4 mt-6 md:px-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900">Annual Leave</h2>
              <Link href="/leave" className="text-sm text-indigo-600 font-medium">View all</Link>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="3"
                    strokeDasharray={`${(leaveBalance.balance_days / leaveBalance.total_entitled_days) * 97.5} 97.5`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-slate-900">{leaveBalance.balance_days}</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">Remaining</span>
                  <span className="font-medium text-slate-900">{leaveBalance.balance_days} days</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">Used</span>
                  <span className="font-medium text-slate-900">{leaveBalance.taken_days} days</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <span className="font-medium text-slate-900">{leaveBalance.total_entitled_days} days</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Upcoming Shifts */}
      <section className="px-4 mt-6 md:px-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Upcoming Shifts</h2>
          <Link href="/rota" className="text-sm text-indigo-600 font-medium">See all</Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                <div className="h-5 bg-slate-200 rounded w-32"></div>
              </div>
            ))}
          </div>
        ) : upcomingShifts.length === 0 ? (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 text-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 grid place-items-center mx-auto mb-3">
              <svg className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-slate-600">No upcoming shifts</p>
            <p className="text-sm text-slate-400 mt-1">Check back later for updates</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingShifts.map((shift) => (
              <div
                key={shift.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-slate-200"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{formatDate(shift.start_time)}</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {formatTime(shift.start_time)} — {formatTime(shift.end_time)}
                    </p>
                  </div>
                  <div className="text-right">
                    {shift.location && (
                      <p className="text-sm text-slate-600">{shift.location}</p>
                    )}
                    {shift.department && (
                      <p className="text-xs text-slate-400 mt-0.5">{shift.department}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Leave Requests */}
      <section className="px-4 mt-6 pb-6 md:px-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Recent Leave</h2>
          <Link href="/leave" className="text-sm text-indigo-600 font-medium">View all</Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-20 mb-2"></div>
                <div className="h-5 bg-slate-200 rounded w-40"></div>
              </div>
            ))}
          </div>
        ) : recentLeave.length === 0 ? (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 text-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 grid place-items-center mx-auto mb-3">
              <svg className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p className="text-slate-600">No leave requests</p>
            <Link href="/leave" className="text-sm text-indigo-600 font-medium mt-2 inline-block">
              Request time off →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recentLeave.map((leave) => (
              <div
                key={leave.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-slate-200"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-500 capitalize">{leave.leave_type.replace("_", " ")}</p>
                    <p className="font-medium text-slate-900 mt-0.5">
                      {formatDateShort(leave.start_date)} — {formatDateShort(leave.end_date)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{leave.duration_days} day{leave.duration_days !== 1 ? "s" : ""}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${getStatusColor(leave.status)}`}>
                    {leave.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
