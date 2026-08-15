import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { toast } from "@medusajs/ui";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { sdk } from "../lib/sdk";

const JUMPCLOUD_PROVIDER = "jumpcloud";

type JumpCloudToken = {
  actor_id?: string;
  user_metadata?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
};

function decodeJwt(token: string): JumpCloudToken {
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JumpCloudToken;
  } catch {
    return {};
  }
}

const JumpCloudLogin = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const sendCallback = async () => {
    return await sdk.auth.callback(
      "user",
      JUMPCLOUD_PROVIDER,
      Object.fromEntries(searchParams),
    );
  };

  const finishLogin = async () => {
    const token = await sendCallback();
    if (typeof token !== "string") {
      toast.error("Authentication failed");
      return;
    }
    const decoded = decodeJwt(token);
    if (!decoded.actor_id) {
      await sdk.client.fetch("/jumpcloud/users", {
        method: "POST",
        body: {
          email: decoded.user_metadata?.email,
          first_name: decoded.user_metadata?.first_name,
          last_name: decoded.user_metadata?.last_name,
        },
      });
      const refreshed = await sdk.auth.refresh();
      const nextToken = typeof refreshed === "string" ? refreshed : refreshed?.token;
      if (!nextToken) {
        toast.error("Authentication failed");
        return;
      }
    }
    navigate("/orders");
  };

  const { mutateAsync } = useMutation({
    mutationFn: finishLogin,
    onError: (error) => {
      console.error("JumpCloud authentication error:", error);
      toast.error("Authentication failed");
    },
  });

  useEffect(() => {
    if (searchParams.get("code")) {
      void mutateAsync();
    }
    if (searchParams.get("error")) {
      toast.error("JumpCloud sign-in was cancelled");
    }
  }, [searchParams, mutateAsync]);

  // Dashboard already renders "Continue with JumpCloud". This widget only
  // finishes the OAuth return (JumpCloud cannot register ?auth_provider=).
  return null;
};

export const config = defineWidgetConfig({
  zone: "login.after",
});

export default JumpCloudLogin;
