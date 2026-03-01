"use client";

import { useLicenseGate } from "@/hooks/useLicenseGate";
import { Loader2, Lock } from "lucide-react";

interface LicenseGateProps {
  /**
   * The extension name (e.g., "staking", "p2p", "ecosystem")
   */
  extensionName: string;
  /**
   * The content to render when license is valid
   */
  children: React.ReactNode;
  /**
   * Optional custom loading component
   */
  loadingComponent?: React.ReactNode;
  /**
   * Whether to skip license check
   */
  skip?: boolean;
}

/**
 * Component that gates access to content based on license status.
 * Redirects to the license activation page if license is not valid.
 */
export function LicenseGate({
  extensionName,
  children,
  loadingComponent,
  skip = false,
}: LicenseGateProps) {
  const { isLicenseValid, isLoading } = useLicenseGate({
    extensionName,
    skip,
  });

  // Show loading state while checking license
  if (isLoading) {
    return (
      loadingComponent || (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Verifying license...</p>
          </div>
        </div>
      )
    );
  }

  // If license is not valid, show a brief message while redirecting
  // (The useLicenseGate hook handles the actual redirect)
  if (!isLicenseValid && !skip) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
            <Lock className="h-8 w-8 text-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">License Required</h3>
            <p className="text-muted-foreground text-sm">
              Redirecting to license activation...
            </p>
          </div>
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    );
  }

  // License is valid, render children
  return <>{children}</>;
}
