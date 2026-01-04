"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProfileData = {
  employeeId: string;
  companyId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  address: string | null;
  dateOfBirth: string | null;
  joinedAt: string | null;
  nationality: string | null;
  companyName: string | null;
  userEmail: string | null;
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
}

export default function EmployeeProfileClient({ initial }: { initial: ProfileData }) {
  const [phone, setPhone] = useState(initial.phone || "");
  const [address, setAddress] = useState(initial.address || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password change
  const [pwEmail, setPwEmail] = useState(initial.userEmail || "");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error: updateError } = await supabase
      .from("employees")
      .update({
        phone: phone || null,
        address: address || null,
      })
      .eq("id", initial.employeeId);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  }

  async function handlePasswordReset() {
    setPwLoading(true);
    setPwError(null);
    setPwMessage(null);

    if (!pwEmail || pwEmail.toLowerCase() !== initial.userEmail?.toLowerCase()) {
      setPwError("Email does not match your account email.");
      setPwLoading(false);
      return;
    }

    try {
      const origin = window.location.origin;
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(pwEmail, {
        redirectTo: `${origin}/auth/update-password`,
      });
      if (resetErr) throw resetErr;
      setPwMessage("Password reset link sent. Check your email.");
    } catch (e: any) {
      setPwError(e?.message || "Could not send reset email.");
    }
    setPwLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <section className="bg-white border-b border-slate-200">
        <div className="px-4 py-6 md:px-6">
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-sm text-slate-500 mt-1">View and update your information</p>
        </div>
      </section>

      <div className="px-4 py-6 md:px-6 space-y-6 max-w-2xl">
        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Avatar & Name */}
          <div className="bg-linear-to-r from-indigo-500 to-purple-600 px-4 py-6 text-white">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-white/20 grid place-items-center text-2xl font-bold">
                {initial.fullName?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div>
                <h2 className="text-xl font-bold">{initial.fullName || "Employee"}</h2>
                <p className="text-indigo-200 text-sm">{initial.department || "No department"}</p>
              </div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Company</p>
                <p className="font-medium text-slate-900 mt-0.5">{initial.companyName || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Joined</p>
                <p className="font-medium text-slate-900 mt-0.5">{formatDate(initial.joinedAt)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Email</p>
                <p className="font-medium text-slate-900 mt-0.5 break-all">{initial.email || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Date of Birth</p>
                <p className="font-medium text-slate-900 mt-0.5">{formatDate(initial.dateOfBirth)}</p>
              </div>
            </div>

            {initial.nationality && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Nationality</p>
                <p className="font-medium text-slate-900 mt-0.5">{initial.nationality}</p>
              </div>
            )}
          </div>
        </div>

        {/* Editable Fields */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-4">Contact Information</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 7123 456789"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Your address"
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                Changes saved successfully!
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60 active:scale-[0.98] transition-transform"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Password Change */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-2">Change Password</h3>
          <p className="text-sm text-slate-500 mb-4">
            Enter your email to receive a password reset link.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Verify Email</label>
              <input
                type="email"
                value={pwEmail}
                onChange={(e) => setPwEmail(e.target.value)}
                placeholder="your.email@company.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {pwError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {pwError}
              </div>
            )}

            {pwMessage && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                {pwMessage}
              </div>
            )}

            <button
              onClick={handlePasswordReset}
              disabled={pwLoading}
              className="w-full h-11 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-60 active:scale-[0.98] transition-transform"
            >
              {pwLoading ? "Sending..." : "Send Reset Link"}
            </button>
          </div>
        </div>

        {/* Account Info */}
        <div className="bg-slate-100 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{initial.userEmail}</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Some information can only be updated by your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
