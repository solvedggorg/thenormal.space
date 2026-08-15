import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { medusa, medusaPublishableKey } from "../lib/medusa";
import { clearShopCart, readShopCart, type ShopCartLine } from "../lib/shop-cart";

type Props = {
  stripePublishableKey: string;
};

type Region = {
  id: string;
  name: string;
  currency_code: string;
  countries?: Array<{ iso_2?: string; display_name?: string }>;
};

type StripeSession = {
  clientSecret: string;
  cartId: string;
};

const appearance = {
  theme: "night" as const,
  variables: {
    colorBackground: "#111110",
    colorText: "#f2f0ea",
    colorPrimary: "#f2f0ea",
    colorDanger: "#e8b4b4",
    borderRadius: "12px",
    fontFamily: "Figtree, system-ui, sans-serif",
  },
};

export default function CheckoutApp({ stripePublishableKey }: Props) {
  const [lines] = useState<ShopCartLine[]>(() => readShopCart());
  const [region, setRegion] = useState<Region | null>(null);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("gb");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [session, setSession] = useState<StripeSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const stripePromise = useMemo(
    () => (stripePublishableKey ? loadStripe(stripePublishableKey) : null),
    [stripePublishableKey],
  );

  useEffect(() => {
    if (!medusaPublishableKey) return;
    void medusa.store.region.list().then(({ regions }) => {
      const next = (regions?.[0] ?? null) as Region | null;
      setRegion(next);
      const first = next?.countries?.[0]?.iso_2;
      if (first) setCountry(first);
    });
  }, []);

  const payable = lines.filter((line) => line.variant_id);
  const blocked = lines.filter((line) => !line.variant_id);

  async function startPayment(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!medusaPublishableKey) {
      setError("The shop backend is not configured.");
      return;
    }
    if (!region || !payable.length) {
      setError("Nothing in this cart can be charged yet.");
      return;
    }
    setBusy(true);
    try {
      const created = await medusa.store.cart.create({
        region_id: region.id,
        email,
        shipping_address: {
          address_1: address,
          city,
          postal_code: postal,
          country_code: country,
        },
      });
      let cart = created.cart;
      for (const line of payable) {
        const updated = await medusa.store.cart.createLineItem(cart.id, {
          variant_id: line.variant_id!,
          quantity: line.quantity,
        });
        cart = updated.cart;
      }
      const options = await medusa.store.fulfillment.listCartOptions({ cart_id: cart.id });
      const option =
        options.shipping_options?.find((item) => item.provider_id?.includes("printful")) ??
        options.shipping_options?.[0];
      if (option?.id) {
        const shipped = await medusa.store.cart.addShippingMethod(cart.id, { option_id: option.id });
        cart = shipped.cart;
      }
      const payment = await medusa.store.payment.initiatePaymentSession(cart, {
        provider_id: "pp_stripe_stripe",
      });
      const secret = clientSecretFrom(payment.payment_collection ?? payment);
      if (!secret) throw new Error("Stripe did not return a client secret.");
      setSession({ clientSecret: secret, cartId: cart.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Stripe.");
    } finally {
      setBusy(false);
    }
  }

  if (!lines.length) {
    return <p className="notice">The cart is empty.</p>;
  }

  if (!stripePublishableKey || !medusaPublishableKey) {
    return (
      <p className="notice">
        Stripe is connected on the account, but this storefront still needs
        PUBLIC_STRIPE_PUBLISHABLE_KEY and PUBLIC_MEDUSA_PUBLISHABLE_KEY.
      </p>
    );
  }

  return (
    <div className="checkout-stack">
      {blocked.length ? (
        <p className="notice">
          Not in Medusa yet, so they cannot be charged: {blocked.map((line) => line.name).join(", ")}.
        </p>
      ) : null}
      {session && stripePromise ? (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: session.clientSecret, appearance }}
        >
          <PayForm cartId={session.cartId} onError={setError} />
        </Elements>
      ) : (
        <form className="checkout-form" onSubmit={startPayment}>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Country
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {(region?.countries ?? [{ iso_2: "gb", display_name: "United Kingdom" }]).map((item) => (
                <option key={item.iso_2} value={item.iso_2}>
                  {item.display_name || item.iso_2}
                </option>
              ))}
            </select>
          </label>
          <label>
            Address
            <input required value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label>
            City
            <input required value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label>
            Postal code
            <input required value={postal} onChange={(e) => setPostal(e.target.value)} />
          </label>
          <div className="btn-row">
            <button className="btn btn-primary" disabled={busy || !payable.length} type="submit">
              {busy ? "Starting Stripe…" : "Continue to card"}
            </button>
          </div>
        </form>
      )}
      {error ? <p className="notice">{error}</p> : null}
    </div>
  );
}

function PayForm({ cartId, onError }: { cartId: string; onError: (message: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    onError("");
    try {
      const submitted = await elements.submit();
      if (submitted.error) throw new Error(submitted.error.message);
      const confirmed = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/checkout?paid=1`,
        },
      });
      if (confirmed.error) throw new Error(confirmed.error.message);
      await medusa.store.cart.complete(cartId);
      clearShopCart();
      window.location.assign("/checkout?paid=1");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Payment failed.");
      setBusy(false);
    }
  }

  return (
    <form className="checkout-form" onSubmit={pay}>
      <PaymentElement />
      <div className="btn-row">
        <button className="btn btn-primary" disabled={busy || !stripe} type="submit">
          {busy ? "Paying…" : "Pay"}
        </button>
      </div>
    </form>
  );
}

function clientSecretFrom(payment: unknown): string {
  const root = payment as {
    payment_collection?: { payment_sessions?: Array<{ data?: { client_secret?: string } }> };
    cart?: { payment_collection?: { payment_sessions?: Array<{ data?: { client_secret?: string } }> } };
  };
  const sessions =
    root.payment_collection?.payment_sessions ??
    root.cart?.payment_collection?.payment_sessions ??
    [];
  return sessions.find((session) => session.data?.client_secret)?.data?.client_secret || "";
}
