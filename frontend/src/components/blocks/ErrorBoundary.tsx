import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an uncaught render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <Card className="w-full max-w-lg border-destructive/30 shadow-md">
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-lg font-semibold flex items-center gap-2 text-destructive">
                <AlertCircle className="size-5" />
                <span>{this.props.fallbackTitle ?? "Something went wrong"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Application Error</AlertTitle>
                <AlertDescription className="text-xs font-mono mt-1 whitespace-pre-wrap break-all">
                  {this.state.error?.message ?? "An unexpected error occurred while rendering this page."}
                </AlertDescription>
              </Alert>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => (window.location.href = "/orders")}>
                  Return to Orders
                </Button>
                <Button size="sm" onClick={this.handleReset}>
                  <RefreshCw className="mr-1.5 size-3.5" />
                  <span>Reload Page</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
