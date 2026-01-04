import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY not configured");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Use service role to bypass RLS
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Look up employee by email (case-insensitive)
    const { data: employee, error: empError } = await admin
      .from("employees")
      .select("id, company_id, full_name, user_id, companies:company_id(company_name)")
      .ilike("email", email.trim())
      .maybeSingle();

    if (empError) {
      console.error("Error fetching employee:", empError.message);
      return NextResponse.json({ error: "Failed to verify invitation" }, { status: 500 });
    }

    if (!employee) {
      return NextResponse.json({ 
        found: false, 
        error: "No employee invitation found for this email" 
      }, { status: 404 });
    }

    // Check if already linked to a user
    if (employee.user_id) {
      return NextResponse.json({ 
        found: true,
        alreadyLinked: true,
        error: "This employee already has an account. Please sign in instead." 
      }, { status: 409 });
    }

    return NextResponse.json({
      found: true,
      alreadyLinked: false,
      employeeId: employee.id,
      companyId: employee.company_id,
      fullName: employee.full_name,
      companyName: (employee.companies as any)?.company_name || null,
    });
  } catch (e: any) {
    console.error("verify-invitation error:", e?.message || e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
