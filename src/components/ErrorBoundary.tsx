import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Something went wrong" };
  }

  componentDidCatch(err: Error) {
    console.error("[ErrorBoundary]", err);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  handleGoHome = () => {
    window.location.href = "/chat";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-background p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">
              {this.props.fallbackTitle || "Something went wrong"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.message}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={this.handleRetry}>
                <RefreshCw className="mr-1.5 size-3.5" />
                Try again
              </Button>
              <Button size="sm" onClick={this.handleGoHome}>
                <Home className="mr-1.5 size-3.5" />
                Go to Chat
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
