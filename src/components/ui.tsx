import type { ReactNode } from "react";
import { X } from "lucide-react";
import { stageColor } from "../lib/format";

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${wide ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card stat">
      <div className="flex between">
        <div>
          <div className="label">{label}</div>
          <div className="value">{value}</div>
        </div>
        {icon && <div className="icon">{icon}</div>}
      </div>
    </div>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const color = stageColor(stage);
  return (
    <span className="badge" style={{ color, borderColor: color + "55", background: color + "14" }}>
      <span className="dot" />
      {stage.replace(/_/g, " ")}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "#22c55e",
    ACTIVATED: "#22c55e",
    INVITED: "#f59e0b",
    INVITATION_SENT: "#f59e0b",
    CREATED: "#64748b",
    SUSPENDED: "#ef4444",
    DEACTIVATED: "#94a3b8",
    INACTIVE: "#94a3b8",
    REACTIVATED: "#0ea5e9",
    PENDING: "#f59e0b",
    APPROVED: "#22c55e",
    REJECTED: "#ef4444",
  };
  const color = map[status] ?? "#64748b";
  return (
    <span className="badge" style={{ color, borderColor: color + "55", background: color + "14" }}>
      <span className="dot" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {hint && <div>{hint}</div>}
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  return <div className={`alert ${kind}`}>{children}</div>;
}