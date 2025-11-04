"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Employee = { id: string; full_name: string };
type Payslip = {
  id: string;
  company_id: string;
  employee_id: string;
  pay_date: string;
  period_start: string;
  period_end: string;
  tax_year: string | null;
  tax_code: string | null;
  gross_pay: number;
  net_pay: number;
  pdf_url: string | null;
};

export default function PayrollClient({ companyId }: { companyId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    payDate: "",
    periodStart: "",
    periodEnd: "",
    taxYear: "",
    taxCode: "1257L",
    grossPay: "",
  });

  const canGenerate = useMemo(() => !!companyId && !!employees.length, [companyId, employees.length]);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      if (!companyId) {
        setPayslips([]);
        setEmployees([]);
        setLoading(false);
        return;
      }
      const [{ data: payslipData }, { data: employeeData }] = await Promise.all([
        supabase
          .from("payslips")
          .select("id, company_id, employee_id, pay_date, period_start, period_end, tax_year, tax_code, gross_pay, net_pay, pdf_url")
          .eq("company_id", companyId)
          .order("pay_date", { ascending: false })
          .limit(100),
        supabase
          .from("employees")
          .select("id, full_name")
          .eq("company_id", companyId)
          .order("full_name", { ascending: true }),
      ]);
      setPayslips((payslipData as any) || []);
      setEmployees((employeeData as any) || []);
    } catch (e: any) {
      setError(e.message || "Failed to load payroll data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, [companyId]);

  async function generatePayslip(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !form.employeeId) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          employeeId: form.employeeId,
          payDate: form.payDate || null,
          periodStart: form.periodStart || null,
          periodEnd: form.periodEnd || null,
          taxYear: form.taxYear || null,
          taxCode: form.taxCode || null,
          grossPay: form.grossPay ? Number(form.grossPay) : null,
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || "Failed to generate payslip");
      setOpen(false);
      setForm({ employeeId: "", payDate: "", periodStart: "", periodEnd: "", taxYear: "", taxCode: "1257L", grossPay: "" });
      fetchAll();
    } catch (e: any) {
      setError(e.message || "Failed to generate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Payroll</h1>
        <button
          onClick={() => setOpen(true)}
          disabled={!canGenerate}
          className="inline-flex items-center h-10 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-60"
        >
          Generate payslip
        </button>
      </div>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="mt-6 overflow-x-auto">
        {loading ? (
          <div>Loading…</div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead className="text-slate-700">
              <tr className="border-b border-slate-200">
                <th className="py-2 pr-4">Pay date</th>
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4">Tax year</th>
                <th className="py-2 pr-4">Tax code</th>
                <th className="py-2 pr-4 text-right">Gross</th>
                <th className="py-2 pr-4 text-right">Net</th>
                <th className="py-2 pr-4">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {payslips.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={7}>No payslips yet.</td>
                </tr>
              )}
              {payslips.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4">{new Date(p.pay_date).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">{new Date(p.period_start).toLocaleDateString()} – {new Date(p.period_end).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">{p.tax_year || ""}</td>
                  <td className="py-2 pr-4">{p.tax_code || ""}</td>
                  <td className="py-2 pr-4 text-right">{p.gross_pay.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-right">{p.net_pay.toFixed(2)}</td>
                  <td className="py-2 pr-4">
                    {p.pdf_url ? (
                      <a className="text-indigo-600 hover:underline" href={p.pdf_url} target="_blank">Download</a>
                    ) : (
                      <button
                        onClick={async () => {
                          try {
                            const resp = await fetch(`/api/payroll/payslip-pdf?payslipId=${p.id}`);
                            if (!resp.ok) throw new Error("Failed to generate PDF");
                            const blob = await resp.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `payslip-${p.id}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                          } catch (e) {
                            console.error(e);
                            alert("Could not generate PDF");
                          }
                        }}
                        className="inline-flex items-center h-8 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-950"
                      >
                        Generate PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Generate payslip</h2>
                <p className="text-xs text-slate-700">Select employee and period, enter amounts</p>
              </div>
              <button onClick={() => setOpen(false)} className="h-8 w-8 grid place-items-center rounded-md border border-slate-200 bg-white hover:bg-slate-100">✕</button>
            </div>

            <form onSubmit={generatePayslip} className="p-6 grid gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-900">Employee</label>
                <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950">
                  <option value="" disabled>Select employee</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-900">Pay date</label>
                  <input type="date" required value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950" />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-900">Tax year</label>
                  <input placeholder="2025/26" value={form.taxYear} onChange={(e) => setForm({ ...form, taxYear: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-900">Period start</label>
                  <input type="date" required value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950" />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-900">Period end</label>
                  <input type="date" required value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-900">Tax code</label>
                  <input value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950" />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-900">Gross pay (£)</label>
                  <input type="number" min="0" step="0.01" required value={form.grossPay} onChange={(e) => setForm({ ...form, grossPay: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950" />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center h-10 px-4 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-950">Cancel</button>
                <button disabled={saving} className="inline-flex items-center h-10 px-5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? "Generating…" : "Generate"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}



