"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

type InvitationData = {
  employeeId: string;
  companyId: string;
  fullName: string | null;
  companyName: string | null;
};

export default function EmployeeSignUpPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [emailLocked, setEmailLocked] = useState(false);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [invitationVerified, setInvitationVerified] = useState(false);

  // Pre-fill email from query param
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      const decodedEmail = decodeURIComponent(emailParam);
      setEmail(decodedEmail);
      setEmailLocked(true);
      // Auto-verify invitation when email comes from URL
      verifyInvitation(decodedEmail);
    }
  }, [searchParams]);

  // Verify invitation via API (bypasses RLS)
  async function verifyInvitation(emailToVerify: string) {
    if (!emailToVerify) return;
    
    setVerifying(true);
    setError(null);

    try {
      const resp = await fetch("/api/employees/verify-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToVerify }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data.alreadyLinked) {
          setError("This employee already has an account. Please sign in instead.");
        } else if (resp.status === 404) {
          setError("No employee invitation found for this email. Please contact your administrator.");
        } else {
          setError(data.error || "Failed to verify invitation");
        }
        setInvitationVerified(false);
        setVerifying(false);
        return;
      }

      // Invitation found
      setInvitation({
        employeeId: data.employeeId,
        companyId: data.companyId,
        fullName: data.fullName,
        companyName: data.companyName,
      });
      setCompanyName(data.companyName);
      if (data.fullName && !fullName) {
        setFullName(data.fullName);
      }
      setInvitationVerified(true);
    } catch (e) {
      console.error("Verification error:", e);
      setError("Failed to verify invitation. Please try again.");
      setInvitationVerified(false);
    }

    setVerifying(false);
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    // Verify invitation if not already verified
    if (!invitationVerified || !invitation) {
      setLoading(true);
      await verifyInvitation(email);
      
      // Check if verification succeeded
      if (!invitation) {
        setLoading(false);
        return;
      }
    }

    setLoading(true);

    // Check if email already exists as a user
    try {
      const resp = await fetch("/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const body = await resp.json();
      if (body.supported && body.exists) {
        setLoading(false);
        setError("An account with this email already exists. Please sign in instead.");
        return;
      }
    } catch (err) {
      console.warn("email check failed:", err);
    }

    // Sign up the user with employee role
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "employee",
          full_name: fullName,
          employee_id: invitation!.employeeId,
          company_id: invitation!.companyId,
          company_name: invitation!.companyName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?type=employee`,
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    // Try to insert profile (may fail due to RLS, will be handled in callback)
    try {
      await supabase.from("profiles").insert({
        user_id: signUpData.user?.id,
        email,
        full_name: fullName,
        role: "employee",
      });
    } catch {}

    setLoading(false);

    if (signUpData?.session) {
      // Session established immediately (email confirmation disabled)
      router.replace("/dashboard");
      return;
    }

    setMessage(
      "Account created! Please check your email to confirm your account, then sign in to access your employee portal."
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 mask-[radial-gradient(60%_50%_at_50%_0%,black,transparent)]">
        <div className="absolute -top-24 -left-10 h-72 w-72 rounded-full bg-indigo-100" />
        <div className="absolute -top-12 right-0 h-64 w-64 rounded-full bg-emerald-100" />
        <div className="absolute bottom-0 -left-10 h-64 w-64 rounded-full bg-amber-100" />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 py-6 flex items-center">
        <Logo width={160} height={38} />
      </header>

      {/* Main */}
      <main className="relative z-10 w-full max-w-5xl mx-auto px-4 pb-16 grid md:grid-cols-2 gap-8 items-center">
        {/* Intro panel */}
        <div className="hidden md:block">
          <h1 className="text-3xl font-semibold text-slate-900">
            {companyName ? `Join ${companyName}` : "Create your employee account"}
          </h1>
          <p className="mt-3 text-slate-600 max-w-md">
            Your employer has invited you to join their HR platform. Create your account to access your employee portal.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-8 w-8 rounded-md bg-indigo-100 grid place-items-center mb-2">
                <svg className="h-4 w-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-800">View your rota</p>
              <p className="text-xs text-slate-500 mt-1">See your shifts and schedule</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-8 w-8 rounded-md bg-emerald-100 grid place-items-center mb-2">
                <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-800">Request leave</p>
              <p className="text-xs text-slate-500 mt-1">Submit and track time off</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-8 w-8 rounded-md bg-amber-100 grid place-items-center mb-2">
                <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-800">View payslips</p>
              <p className="text-xs text-slate-500 mt-1">Access your pay history</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-8 w-8 rounded-md bg-purple-100 grid place-items-center mb-2">
                <svg className="h-4 w-4 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-800">Your profile</p>
              <p className="text-xs text-slate-500 mt-1">Manage your details</p>
            </div>
          </div>
        </div>

        {/* Auth card */}
        <div className="w-full">
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              {invitationVerified ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 mb-3">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  Invitation verified
                </div>
              ) : verifying ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 mb-3">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                  </svg>
                  Verifying invitation...
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700 mb-3">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Employee invitation
                </div>
              )}
              <h2 className="text-xl font-semibold text-slate-900">Create your account</h2>
              <p className="text-sm text-slate-600 mt-1">
                {companyName ? `You've been invited to join ${companyName}` : "Complete your registration"}
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-800">Full name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    if (!emailLocked) {
                      setEmail(e.target.value);
                      setInvitationVerified(false);
                      setInvitation(null);
                    }
                  }}
                  onBlur={() => {
                    if (email && !invitationVerified && !emailLocked) {
                      verifyInvitation(email);
                    }
                  }}
                  required
                  readOnly={emailLocked}
                  className={`mt-1 w-full rounded-md border px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 ${
                    emailLocked ? "border-slate-200 bg-slate-50 cursor-not-allowed" : "border-slate-300"
                  }`}
                  placeholder="your.email@company.com"
                />
                {emailLocked && (
                  <p className="text-xs text-slate-500 mt-1">
                    This email was provided in your invitation and cannot be changed.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                  placeholder="••••••••"
                />
                <p className="text-xs text-slate-500 mt-1">Minimum 6 characters.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-sm text-red-600" role="alert">
                    {error}
                  </p>
                </div>
              )}

              {message && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-sm text-emerald-700">{message}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || verifying}
                className="w-full h-11 rounded-md bg-indigo-600 text-white font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? "Creating account..." : verifying ? "Verifying..." : "Create account"}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-600">
                Already have an account?{" "}
                <Link href="/sign-in" className="text-indigo-600 hover:text-indigo-700 font-medium">
                  Sign in
                </Link>
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Are you a business admin?{" "}
                <Link href="/sign-up" className="text-indigo-600 hover:text-indigo-700 font-medium">
                  Create admin account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
