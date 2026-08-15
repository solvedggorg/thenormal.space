import { ClerkProvider, SignedIn, SignedOut, SignIn, UserButton, useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { clearMedusaSession, syncMedusaCustomer } from "../lib/customer-auth";

type Props = {
  publishableKey: string;
  backendReady: boolean;
};

const appearance = {
  variables: {
    colorBackground: "#111110",
    colorInputBackground: "#070707",
    colorText: "#f2f0ea",
    colorTextSecondary: "#c4c1b8",
    colorPrimary: "#f2f0ea",
    colorTextOnPrimaryBackground: "#070707",
    colorNeutral: "#c4c1b8",
    borderRadius: "12px",
    fontFamily: "Figtree, system-ui, sans-serif",
  },
};

export default function AccountApp({ publishableKey, backendReady }: Props) {
  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/account" appearance={appearance}>
      <SignedOut>
        <div className="clerk-box">
          <SignIn routing="hash" />
        </div>
      </SignedOut>
      <SignedIn>
        <SignedInAccount backendReady={backendReady} />
      </SignedIn>
    </ClerkProvider>
  );
}

function SignedInAccount({ backendReady }: { backendReady: boolean }) {
  const { getToken, isSignedIn } = useAuth();
  const [status, setStatus] = useState<"idle" | "syncing" | "ready" | "error">(
    backendReady ? "syncing" : "idle",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isSignedIn === false) {
      void clearMedusaSession();
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!backendReady) return;
    let cancelled = false;
    const run = async () => {
      setStatus("syncing");
      try {
        const token = await getToken();
        if (!token) throw new Error("No Clerk session.");
        await syncMedusaCustomer(token);
        if (!cancelled) {
          setStatus("ready");
          setMessage("The shop knows this account.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Could not reach the shop.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [backendReady, getToken]);

  return (
    <div className="account-panel">
      <div className="account-user">
        <UserButton />
      </div>
      {!backendReady && <p className="notice">Signed in with Clerk. The shop backend is not live yet.</p>}
      {backendReady && status === "syncing" && <p className="notice">Linking this account to the shop.</p>}
      {backendReady && status === "ready" && <p className="notice">{message}</p>}
      {backendReady && status === "error" && <p className="notice">{message}</p>}
    </div>
  );
}
