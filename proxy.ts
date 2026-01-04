import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

const PUBLIC_PATHS = new Set<string>([
  "/", // landing page
  "/sign-in",
  "/sign-up",
  "/employee-signup", // employee invitation sign-up
  "/auth/callback", // email confirmation callback
]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow Next internals and public assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth")
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient(
    { req, res },
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Public paths logic
  if (PUBLIC_PATHS.has(pathname)) {
    // If unauthenticated, allow
    if (!session) return res;

    // If authenticated and trying to access sign-in or sign-up, redirect based on role and profile completion
    if (pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/employee-signup") {
      const role = (session.user.user_metadata as any)?.role;
      
      // Employees go directly to dashboard
      if (role === "employee") {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
      
      // Business admins check company profile completion
      const profileCompleted = await isCompanyProfileCompleted(supabase, session.user.id);
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = profileCompleted ? "/dashboard" : "/company/profile";
      return NextResponse.redirect(redirectUrl);
    }

    // For other public paths (/, /auth/callback) allow request to proceed while refreshing session
    return res;
  }

  // Protected paths: require session
  if (!session) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const role = (session.user.user_metadata as any)?.role;

  // Employees skip company profile check and billing gate
  if (role === "employee") {
    return res;
  }

  // If authenticated but company profile is not completed, restrict access to only /company/profile
  const profileCompleted = await isCompanyProfileCompleted(supabase, session.user.id);
  if (!profileCompleted && pathname !== "/company/profile") {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/company/profile";
    return NextResponse.redirect(redirectUrl);
  }

  // Gate access if trial expired and subscription not active
  const { gated, redirectTo } = await shouldGateForBilling(supabase, session.user.id, pathname);
  if (gated) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = redirectTo;
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

async function shouldGateForBilling(supabase: ReturnType<typeof createMiddlewareClient>, userId: string, pathname: string) {
  // Allow billing pages to fix subscription
  if (pathname.startsWith("/billing") || pathname.startsWith("/settings")) return { gated: false, redirectTo: "" };

  const { data: company } = await supabase
    .from("companies")
    .select("subscription_status, trial_end_at")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (!company) return { gated: false, redirectTo: "" };

  const now = new Date();
  const trialEnd = (company as any).trial_end_at ? new Date((company as any).trial_end_at) : null;
  const status = (company as any).subscription_status;

  // If trial is active, allow access
  if (trialEnd && trialEnd > now) return { gated: false, redirectTo: "" };

  // If active subscription, allow access
  if (status === "active" || status === "trialing") return { gated: false, redirectTo: "" };

  // Otherwise, restrict access (redirect to billing/settings)
  return { gated: true, redirectTo: "/billing" };
}

async function isCompanyProfileCompleted(supabase: ReturnType<typeof createMiddlewareClient>, userId: string) {
  const { data: company } = await supabase
    .from("companies")
    .select("company_name, phone, address")
    .eq("owner_user_id", userId)
    .maybeSingle();
  
  if (!company) return false;
  return !!((company as any).company_name && (company as any).phone && (company as any).address);
}
