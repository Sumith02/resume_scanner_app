import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { InvitePage } from "./pages/InvitePage";
import { SetPasswordPage } from "./pages/SetPasswordPage";
import { AuditLog } from "./pages/AuditLog";
import { MasterOverview } from "./pages/master/MasterOverview";
import { MasterCompanies } from "./pages/master/MasterCompanies";
import { MasterSeatRequests } from "./pages/master/MasterSeatRequests";
import { MasterAnalytics } from "./pages/master/MasterAnalytics";
import { CompanyDashboard } from "./pages/company/CompanyDashboard";
import { CandidatesPage } from "./pages/company/CandidatesPage";
import { PipelinePage } from "./pages/company/PipelinePage";
import { JobsPage } from "./pages/company/JobsPage";
import { UsersPage } from "./pages/company/UsersPage";
import { PoolsPage } from "./pages/company/PoolsPage";
import { MatchesPage } from "./pages/company/MatchesPage";
import { InterviewsPage } from "./pages/company/InterviewsPage";
import { OffersPage } from "./pages/company/OffersPage";
import { EmailPage } from "./pages/company/EmailPage";
import { AnalyticsPage } from "./pages/company/AnalyticsPage";
import { BillingPage } from "./pages/company/BillingPage";
import { PortalPage } from "./pages/company/PortalPage";
import { ClientPortalPage } from "./pages/public/ClientPortalPage";

function FullScreenLoader() {
  return (
    <div className="center-screen">
      <div className="spinner" style={{ borderTopColor: "#0ea5e9" }} />
    </div>
  );
}

function homeFor(role: string | undefined): string {
  return role === "MASTER_ADMIN" ? "/master" : "/app";
}

function RequireAuth({
  children,
  platform = false,
  allowPasswordChange = false,
}: {
  children: ReactNode;
  platform?: boolean;
  allowPasswordChange?: boolean;
}) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && !allowPasswordChange) {
    return <Navigate to="/set-password" replace />;
  }
  if (allowPasswordChange) return <>{children}</>;
  const isMaster = user.role === "MASTER_ADMIN";
  if (platform && !isMaster) return <Navigate to="/app" replace />;
  if (!platform && isMaster) return <Navigate to="/master" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route
        path="/set-password"
        element={
          <RequireAuth allowPasswordChange>
            <SetPasswordPage />
          </RequireAuth>
        }
      />
      <Route path="/portal/:token" element={<ClientPortalPage />} />

      <Route
        path="/"
        element={
          loading ? <FullScreenLoader /> : <Navigate to={user ? homeFor(user.role) : "/login"} replace />
        }
      />

      {/* Master Admin */}
      <Route
        path="/master"
        element={
          <RequireAuth platform>
            <Layout title="Platform Overview">
              <MasterOverview />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/master/companies"
        element={
          <RequireAuth platform>
            <Layout title="Companies">
              <MasterCompanies />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/master/seats"
        element={
          <RequireAuth platform>
            <Layout title="Seat Requests">
              <MasterSeatRequests />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/master/audit"
        element={
          <RequireAuth platform>
            <Layout title="Audit Log">
              <AuditLog scope="master" />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/master/analytics"
        element={
          <RequireAuth platform>
            <Layout title="Platform Analytics">
              <MasterAnalytics />
            </Layout>
          </RequireAuth>
        }
      />

      {/* Company tenant */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <Layout title="Company Dashboard">
              <CompanyDashboard />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/candidates"
        element={
          <RequireAuth>
            <Layout title="Talent Database">
              <CandidatesPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/pipeline"
        element={
          <RequireAuth>
            <Layout title="Pipeline">
              <PipelinePage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/jobs"
        element={
          <RequireAuth>
            <Layout title="Jobs">
              <JobsPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/matches"
        element={
          <RequireAuth>
            <Layout title="AI Matching">
              <MatchesPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/pools"
        element={
          <RequireAuth>
            <Layout title="Talent Pools">
              <PoolsPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/interviews"
        element={
          <RequireAuth>
            <Layout title="Interviews">
              <InterviewsPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/offers"
        element={
          <RequireAuth>
            <Layout title="Offers & Onboarding">
              <OffersPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/email"
        element={
          <RequireAuth>
            <Layout title="Email">
              <EmailPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/analytics"
        element={
          <RequireAuth>
            <Layout title="Analytics">
              <AnalyticsPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/portal"
        element={
          <RequireAuth>
            <Layout title="Client Portal">
              <PortalPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/billing"
        element={
          <RequireAuth>
            <Layout title="Billing & Usage">
              <BillingPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/users"
        element={
          <RequireAuth>
            <Layout title="Users & Seats">
              <UsersPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/audit"
        element={
          <RequireAuth>
            <Layout title="Audit Log">
              <AuditLog scope="org" />
            </Layout>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}