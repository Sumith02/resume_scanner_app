import { useEffect, useState } from "react";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Stat, StatusBadge } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import { formatDate } from "../../lib/format";
import type { Invoice, Plan, Subscription, UsageSummary } from "../../types";

function money(cents: number, currency = "USD") {
  return `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function BillingPage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<{ plan: Plan; subscription: Subscription | null } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const [u, p, s, i] = await Promise.all([
        api.usageSummary(),
        api.listPlans(),
        api.subscription(),
        api.listInvoices(),
      ]);
      setUsage(u);
      setPlans(p);
      setSub(s);
      setInvoices(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function choose(code: string) {
    setError(null);
    setNotice(null);
    try {
      await api.subscribe(code);
      setNotice(`Switched to the ${code} plan.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan change failed");
    }
  }

  async function pay(inv: Invoice) {
    try {
      await api.payInvoice(inv.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    }
  }

  if (error && !usage) return <Alert kind="error">{error}</Alert>;

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="page-head">
        <div>
          <h1>Billing & Usage</h1>
          <div className="sub">Manage your plan, seats, quotas and invoices.</div>
        </div>
      </div>

      {sub && (
        <div className="grid cols-3">
          <Stat label="Current plan" value={sub.plan.name} icon={<Sparkles size={18} />} />
          <Stat label="Seats" value={`${sub.subscription?.seats ?? sub.plan.seat_limit}`} />
          <Stat
            label="Renews"
            value={sub.subscription?.current_period_end ? formatDate(sub.subscription.current_period_end) : "—"}
          />
        </div>
      )}

      {usage && (
        <div className="card mt-2">
          <h3>Usage this period ({usage.period})</h3>
          <div className="grid cols-3">
            {Object.entries(usage.metrics).map(([metric, m]) => (
              <div key={metric}>
                <div className="flex between" style={{ fontSize: 12.5 }}>
                  <span>{metric.replace(/_/g, " ")}</span>
                  <strong>
                    {m.used}
                    {m.limit >= 0 ? ` / ${m.limit}` : " / ∞"}
                  </strong>
                </div>
                <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4 }}>
                  <div
                    style={{
                      width: `${Math.min(100, m.percent)}%`,
                      height: "100%",
                      background: m.percent > 85 ? "#ef4444" : "#0ea5e9",
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="mt-2">Plans</h3>
      <div className="grid cols-3">
        {plans.map((p) => {
          const current = sub?.plan.code === p.code;
          return (
            <div className="card" key={p.code} style={current ? { borderColor: "#0ea5e9" } : undefined}>
              <div className="flex between">
                <h3>{p.name}</h3>
                {current && <span className="pill">current</span>}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {p.price_monthly_cents === 0 ? "Free" : money(p.price_monthly_cents)}
                <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                  {p.price_monthly_cents ? "/mo" : ""}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, margin: "8px 0" }}>
                Up to {p.seat_limit} seats
              </div>
              <ul className="feature-list">
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={13} /> {f.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
              {can(user, "billing:manage") && !current && (
                <button className="btn primary" onClick={() => choose(p.code)}>
                  Choose {p.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="card mt-2 table-wrap">
        <h3>
          <CreditCard size={15} /> Invoices
        </h3>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Issued</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.number}</td>
                <td>{inv.period}</td>
                <td>{money(inv.amount_cents, inv.currency)}</td>
                <td>
                  <StatusBadge status={inv.status} />
                </td>
                <td>{inv.issued_at ? formatDate(inv.issued_at) : "—"}</td>
                <td style={{ textAlign: "right" }}>
                  {inv.status !== "PAID" && can(user, "billing:manage") && (
                    <button className="btn sm primary" onClick={() => pay(inv)}>
                      Pay
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <Empty title="No invoices yet" />}
      </div>
    </>
  );
}
