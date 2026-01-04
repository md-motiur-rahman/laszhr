import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type"); // "employee" for employee sign-ups
  // Use Next.js cookies helper so auth-helpers can attach cookies to the response
  const res = new NextResponse(null, { status: 302 });

  try {
    const supabase = createRouteHandlerClient(
      { cookies },
      {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      }
    );

    if (!code) {
      const redirectUrl = new URL("/sign-in?error=missing_code", requestUrl.origin);
      res.headers.set("Location", redirectUrl.toString());
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    // Establish a session using the confirmation code
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const redirectUrl = new URL("/sign-in?error=invalid_code", requestUrl.origin);
      res.headers.set("Location", redirectUrl.toString());
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    // Retrieve the authenticated user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (!user || userErr) {
      const redirectUrl = new URL("/sign-in?error=no_user", requestUrl.origin);
      res.headers.set("Location", redirectUrl.toString());
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    const meta = (user.user_metadata as any) || {};
    const role = meta.role ?? "business_admin";
    const full_name = meta.full_name ?? null;
    let company_name = meta.company_name ?? null;
    const company_id = meta.company_id ?? null;

    // Get service role client for operations that need to bypass RLS
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const admin = serviceKey
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

    // For employees, fetch company name from the companies table if not in metadata
    if ((role === "employee" || type === "employee") && !company_name && admin) {
      try {
        // Try to get company name from company_id in metadata
        if (company_id) {
          const { data: companyData } = await admin
            .from("companies")
            .select("company_name")
            .eq("id", company_id)
            .maybeSingle();
          
          if (companyData?.company_name) {
            company_name = companyData.company_name;
          }
        }
        
        // If still no company name, try to find via employee record
        if (!company_name && user.email) {
          const { data: empData } = await admin
            .from("employees")
            .select("company_id, companies:company_id(company_name)")
            .ilike("email", user.email)
            .maybeSingle();
          
          if (empData?.companies && (empData.companies as any)?.company_name) {
            company_name = (empData.companies as any).company_name;
          }
        }
      } catch (e) {
        console.warn("Failed to fetch company name for employee:", e);
      }
    }

    // Upsert the user profile using service role to bypass RLS
    if (admin) {
      try {
        // Ensure role is a valid enum value
        const validRole = role === "employee" ? "employee" : "business_admin";
        
        const { error: profileErr } = await admin.from("profiles").upsert(
          {
            user_id: user.id,
            email: user.email ?? "",
            full_name,
            company_name,
            role: validRole,
          },
          { onConflict: "user_id" }
        );

        if (profileErr) {
          console.error("Profile upsert failed:", profileErr.message, profileErr);
          // Try insert if upsert failed
          const { error: insertErr } = await admin.from("profiles").insert({
            user_id: user.id,
            email: user.email ?? "",
            full_name,
            company_name,
            role: validRole,
          });
          if (insertErr) {
            console.error("Profile insert also failed:", insertErr.message);
          } else {
            console.log(`Profile created via insert for user ${user.id} with role ${validRole} and company ${company_name}`);
          }
        } else {
          console.log(`Profile created/updated for user ${user.id} with role ${validRole} and company ${company_name}`);
        }
      } catch (profileErr) {
        console.error("Profile upsert exception:", profileErr);
      }
    } else {
      console.warn("No service role key - cannot create profile");
    }

    // Handle employee sign-up: link user to their employee record
    if (role === "employee" || type === "employee") {
      if (admin && user.email) {
        try {
          // Find the employee record by email and link it to this user
          const { data: employee, error: empFindErr } = await admin
            .from("employees")
            .select("id, company_id, user_id")
            .ilike("email", user.email)
            .is("user_id", null) // Only link if not already linked
            .maybeSingle();

          if (employee && !empFindErr) {
            // Update the employee record to link to this user
            const { error: linkErr } = await admin
              .from("employees")
              .update({ user_id: user.id })
              .eq("id", employee.id);

            if (linkErr) {
              console.warn("Failed to link employee to user:", linkErr.message);
            } else {
              console.log(`Linked employee ${employee.id} to user ${user.id}`);
            }
          } else if (empFindErr) {
            console.warn("Error finding employee:", empFindErr.message);
          } else {
            console.warn(`No unlinked employee found for email: ${user.email}`);
          }
        } catch (linkErr) {
          console.warn("Employee linking exception:", linkErr);
        }
      }

      // Redirect employees to dashboard
      const redirectUrl = new URL("/dashboard", requestUrl.origin);
      res.headers.set("Location", redirectUrl.toString());
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    // Ensure a company row exists for business_admin users on first sign-in
    if (role === "business_admin") {
      try {
        const { data: existing } = await supabase
          .from("companies")
          .select("id")
          .eq("owner_user_id", user.id)
          .maybeSingle();

        if (!existing && admin) {
          const companyNameVal = company_name || (user.email ? user.email.split("@")[1] : "Your Company");
          const now = new Date();
          const trialEnd = new Date(now);
          trialEnd.setDate(now.getDate() + 14);

          const { error: companyErr } = await admin.from("companies").insert({
            owner_user_id: user.id,
            company_name: companyNameVal,
            subscription_status: "trialing",
            trial_start_at: now.toISOString(),
            trial_end_at: trialEnd.toISOString(),
          });

          if (companyErr) {
            console.warn("Company creation failed:", companyErr.message);
          }
        }
      } catch (e) {
        console.warn("Company check/creation exception:", e);
      }
    }

    // Determine redirect based on company profile completion
    let redirectPath = "/dashboard";
    if (role === "business_admin") {
      const { data, error } = await supabase
        .from("companies")
        .select("address, phone, company_email, paye_ref")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      const isCompleted = !error && data && data.address && data.phone && data.company_email && data.paye_ref;
      redirectPath = isCompleted ? "/dashboard" : "/company/profile";
    }

    const redirectUrl = new URL(redirectPath, requestUrl.origin);
    res.headers.set("Location", redirectUrl.toString());
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    console.error("/auth/callback error:", e);
    return NextResponse.redirect(new URL("/sign-in?error=callback", requestUrl.origin));
  }
}
