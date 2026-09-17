import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Resume Scanner caught runtime error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#090d16",
            color: "#ffffff",
            padding: "24px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          }}
        >
          <div
            style={{
              maxWidth: "560px",
              width: "100%",
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "14px",
              padding: "36px 28px",
              textAlign: "center",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)"
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 20px"
              }}
            >
              <AlertTriangle size={28} />
            </div>
            <h2 style={{ margin: "0 0 10px 0", fontSize: "20px", fontWeight: 700, color: "#f87171" }}>
              Workspace Temporarily Interrupted
            </h2>
            <p style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#9ca3af", lineHeight: 1.5 }}>
              Resume Scanner intercepted an interface error. Click reload below to refresh the workspace.
            </p>
            {this.state.error?.message && (
              <div
                style={{
                  background: "#030712",
                  border: "1px solid #1f2937",
                  borderRadius: "8px",
                  padding: "12px",
                  color: "#fca5a5",
                  fontSize: "12px",
                  textAlign: "left",
                  overflowX: "auto",
                  marginBottom: "24px",
                  fontFamily: "monospace"
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReload}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                padding: "10px 22px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <RefreshCw size={16} />
              <span>Reload Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
