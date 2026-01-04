import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { redirect } from "next/navigation";
import EmployeeShell from "@/components/EmployeeShell";
import EmployeeProfileClient from "@/components/EmployeeProfileClient";

export default async function EmployeeProfilePage() {
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

  if (!user) {
    redirect("/sign-in");
  }

  const role = (user.user_metadata as any)?.role;

  // Only employees can access this page
  if (role !== "employee") {
    redirect("/admin/profile");
  }

  // Find the employee record linked to this user
  const { data: employee } = await supabase
    .from("employees")
    .select(`
      id,
      company_id,
      full_name,
      email,
      phone,
      department,
      address,
      date_of_birth,
      joined_at,
      nationality,
      companies:company_id(company_name)
    `)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!employee) {
    redirect("/dashboard");
  }

  const profileData = {
    employeeId: employee.id,
    companyId: employee.company_id,
    fullName: employee.full_name,
    email: employee.email,
    phone: employee.phone,
    department: employee.department,
    address: employee.address,
    dateOfBirth: employee.date_of_birth,
    joinedAt: employee.joined_at,
    nationality: employee.nationality,
    companyName: (employee.companies as any)?.company_name || null,
    userEmail: user.email || null,
  };

  return (
    <EmployeeShell
      employeeName={profileData.fullName}
      companyName={profileData.companyName}
    >
      <EmployeeProfileClient initial={profileData} />
    </EmployeeShell>
  );
}
