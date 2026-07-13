import { Component } from "react";

import BitMascot from "./BitMascot";
import Button from "./Button";

// Error boundaries must be class components — React has no hook equivalent.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled error in BIT Code Lab:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-6 text-center">
        <BitMascot className="h-16 w-16" />
        <p className="text-lg font-semibold text-ink">Something went wrong.</p>
        <p className="max-w-md text-sm text-ink/60">
          This page hit an unexpected error. Your saved classroom projects are safe — reloading
          usually fixes it.
        </p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </div>
    );
  }
}
