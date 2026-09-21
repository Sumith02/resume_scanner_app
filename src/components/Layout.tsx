import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarClock,
  FileText,
  FolderOpen,
  Handshake,
  LayoutDashboard,
  LogOut,
  Mail,
  ScrollText,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/format";

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
}

const MASTER_NAV: NavEntry[] = [
  { to: "/master", label: "Overview", icon: <LayoutDashboard size={17} /> },
  { to: "/master/companies", label: "Companies", icon: <Building2 size={17} /> },
  { to: "/master/seats", label: "Seat Requests", icon: <Users size={17} /> },
  { to: "/master/analytics", label: "Analytics", icon: <TrendingUp size={17} /> },
  { to: "/master/audit", label: "Audit Log", icon: <ScrollText size={17} /> },
];

const COMPANY_NAV: NavEntry[] = [
  { to: "/app", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
  { to: "/app/candidates", label: "Candidates", icon: <FileText size={17} /> },
  { to: "/app/pipeline", label: "Pipeline", icon: <BarChart3 size={17} /> },
  { to: "/app/jobs", label: "Jobs", icon: <Briefcase size={17} /> },
  { to: "/app/matches", label: "AI Matching", icon: <Sparkles size={17} /> },
  { to: "/app/pools", label: "Talent Pools", icon: <FolderOpen size={17} /> },
  { to: "/app/interviews", label: "Interviews", icon: <CalendarClock size={17} /> },
  { to: "/app/offers", label: "Offers & Onboarding", icon: <Handshake size={17} /> },
  { to: "/app/email", label: "Email", icon: <Mail size={17} /> },
  { to: "/app/analytics", label: "Analytics", icon: <TrendingUp size={17} /> },
  { to: "/app/portal", label: "Client Portal", icon: <Share2 size={17} /> },
  { to: "/app/users", label: "Users & Seats", icon: <Users size={17} /> },
  { to: "/app/audit", label: "Audit Log", icon: <ScrollText size={17} /> },
];

export function Layout({ children, title }: { children: ReactNode; title: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isMaster = user?.role === "MASTER_ADMIN";
  const nav = isMaster ? MASTER_NAV : COMPANY_NAV;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">N</div>
          Nexerra Talent OS
        </div>

        <div className="nav-section">{isMaster ? "Platform" : "Workspace"}</div>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/master" || item.to === "/app"}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        <div className="spacer" />
        <div className="who">
          <div className="flex between">
            <div>
              <div className="name">{user?.name}</div>
              <div className="role">
                {user ? roleLabel(user.role) : ""}
                {isMaster ? " · Platform" : ""}
              </div>
            </div>
            <button
              className="icon-btn"
              style={{ color: "#94a3b8" }}
              title="Sign out"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h2>{title}</h2>
          <span className="badge">
            <ShieldCheck size={13} />
            {isMaster ? "Platform Admin" : "Tenant Isolated"}
          </span>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
