import ProtectedShell from "@/components/ProtectedShell";
import EmployeeShell from "@/components/EmployeeShell";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import RotaClient from "@/components/RotaClient";

export default async function RotaPage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(
    { cookies: () => cookieStore as any },
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.user_metadata as any)?.role || "business_admin";

  // If employee, show their rota only
  if (role === "employee") {
    // Use service role to bypass RLS for employee lookup
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const admin = serviceKey
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

    let employee = null;
    
    if (admin) {
      // First try by user_id
      const { data: empByUserId } = await admin
        .from("employees")
        .select("id, company_id, full_name, email, user_id, companies:company_id(company_name)")
        .eq("user_id", user?.id || "")
        .maybeSingle();
      
      if (empByUserId) {
        employee = empByUserId;
      } else if (user?.email) {
        // Fallback: try to find by email (case-insensitive)
        const { data: empByEmail } = await admin
          .from("employees")
          .select("id, company_id, full_name, email, user_id, companies:company_id(company_name)")
          .ilike("email", user.email)
          .maybeSingle();
        
        employee = empByEmail;
        
        // If found by email but user_id not set, link them
        if (employee && !employee.user_id && user?.id) {
          await admin
            .from("employees")
            .update({ user_id: user.id })
            .eq("id", employee.id);
        }
      }
    }

    return (
      <EmployeeShell
        employeeName={employee?.full_name || null}
        companyName={(employee?.companies as any)?.company_name || null}
      >
        <RotaClient
          userId={user?.id || null}
          role="employee"
          companyId={employee?.company_id || null}
          companyName={(employee?.companies as any)?.company_name || null}
          userName={employee?.full_name || null}
          filterEmployeeId={employee?.id || null}
        />
      </EmployeeShell>
    );
  }

  // Admin view
  // Resolve profile role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", user?.id || "")
    .maybeSingle();

  // Resolve company for admin
  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name")
    .eq("owner_user_id", user?.id || "")
    .maybeSingle();

  const sp = await searchParams;
  const empParam = typeof sp?.employee === "string" ? sp.employee : null;

  return (
    <ProtectedShell>
      <RotaClient
        userId={user?.id || null}
        role={(profile?.role as any) || "business_admin"}
        companyId={company?.id || null}
        companyName={company?.company_name || null}
        userName={profile?.full_name || null}
        filterEmployeeId={empParam}
      />
    </ProtectedShell>
  );
}
