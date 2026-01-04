import ProtectedShell from "@/components/ProtectedShell";
import EmployeeShell from "@/components/EmployeeShell";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import LeaveClient from "@/components/LeaveClient";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const supabase = createServerComponentClient(
    { cookies },
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  const requestedEmployeeId = typeof params?.employee === "string" ? params.employee : undefined;

  const role = (user?.user_metadata as any)?.role || "business_admin";

  // Employee view
  if (role === "employee") {
    // Use service role to bypass RLS for employee lookup
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const admin = serviceKey
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

    let emp = null;
    
    if (admin) {
      // First try by user_id
      const { data: empByUserId } = await admin
        .from("employees")
        .select("id, company_id, full_name, email, companies:company_id(company_name)")
        .eq("user_id", user?.id || "")
        .maybeSingle();
      
      if (empByUserId) {
        emp = empByUserId;
      } else if (user?.email) {
        // Fallback: try to find by email (case-insensitive)
        const { data: empByEmail } = await admin
          .from("employees")
          .select("id, company_id, full_name, email, companies:company_id(company_name)")
          .ilike("email", user.email)
          .maybeSingle();
        
        emp = empByEmail;
        
        // If found by email but user_id not set, link them
        if (emp && !emp.user_id && user?.id) {
          await admin
            .from("employees")
            .update({ user_id: user.id })
            .eq("id", emp.id);
        }
      }
    }

    return (
      <EmployeeShell
        employeeName={emp?.full_name || null}
        companyName={(emp?.companies as any)?.company_name || null}
      >
        <LeaveClient
          role="employee"
          companyId={emp?.company_id || null}
          employeeId={emp?.id || null}
          employeeName={emp?.full_name || null}
          employeeEmail={emp?.email || user?.email || null}
          initialEmployeeId={emp?.id || null}
        />
      </EmployeeShell>
    );
  }

  // Admin view
  let companyId: string | null = null;

  // Admin: company is owned by this user
  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name")
    .eq("owner_user_id", user?.id || "")
    .maybeSingle();
  companyId = company?.id || null;

  return (
    <ProtectedShell>
      <LeaveClient
        role="business_admin"
        companyId={companyId}
        employeeId={null}
        initialEmployeeId={requestedEmployeeId || null}
      />
    </ProtectedShell>
  );
}
