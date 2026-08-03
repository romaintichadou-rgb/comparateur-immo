import "server-only";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/**
 * Webhook Stripe — la SEULE source de vérité du plan payant.
 *
 * ── Pourquoi le plan ne se met jamais à jour depuis le navigateur ────────
 * La redirection de retour (`/upgrade/success`) prouve seulement que
 * l'utilisateur a vu une page. Elle est déclenchée par son navigateur : elle
 * peut être ouverte à la main, rejouée, ou ne jamais arriver s'il ferme
 * l'onglet après avoir payé. Seul l'appel serveur-à-serveur de Stripe, signé,
 * atteste d'un paiement. C'est donc lui, et lui seul, qui écrit `plan`.
 *
 * ── Pourquoi la `service_role` key ICI, alors que `db.ts` l'a bannie ─────
 * `db.ts` sert des requêtes AU NOM d'un utilisateur connecté : y utiliser une
 * clé qui contourne RLS supprimerait une des deux barrières de cloisonnement.
 * Ce handler n'a aucune session — l'appelant est Stripe, pas un navigateur —
 * et doit écrire sur la ligne d'un compte qu'il identifie par la signature du
 * paiement. Aucun client de session ne peut faire ça. L'exception est donc
 * volontaire, limitée à ce fichier, et bornée à la colonne `plan` /
 * `stripe_customer_id` de `profiles`.
 *
 * ⚠️ Ne pas « factoriser » ce client vers `lib/supabase/` : sa portée doit
 * rester visible à l'œil nu dans le seul fichier qui en a besoin.
 */

/** Client admin, sans session : réservé au traitement d'un événement signé. */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Variable d'environnement manquante : SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    // 500 et pas 200 : Stripe réessaiera une fois la configuration en place,
    // au lieu de considérer l'événement comme traité et de le perdre.
    console.error("[stripe] STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET manquante");
    return NextResponse.json({ error: "Webhook non configuré" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature absente" }, { status: 400 });
  }

  // Le corps BRUT est indispensable : `req.json()` re-sérialiserait l'objet et
  // la moindre différence d'espacement invaliderait la signature.
  const payload = await req.text();
  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    // Signature invalide = l'appel ne vient pas de Stripe. On refuse sans
    // détailler la raison.
    console.error("[stripe] signature invalide", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        // `client_reference_id` est posé par nous sur le Payment Link (voir
        // `BoutonPasserPro`). On ne se rabat PAS sur l'email : celui saisi
        // dans Stripe peut différer de celui du compte, et ferait basculer
        // le mauvais profil — ou aucun.
        const userId = session.client_reference_id;
        if (!userId) {
          console.error("[stripe] checkout sans client_reference_id", session.id);
          // 200 : l'événement est bien reçu, le rejouer ne changerait rien.
          break;
        }

        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

        const { error } = await adminClient()
          .from("profiles")
          .update({ plan: "pro", stripe_customer_id: customerId })
          .eq("id", userId);

        if (error) throw new Error(error.message);
        console.log("[stripe] compte passé en pro", userId);
        break;
      }

      case "customer.subscription.deleted": {
        // Résiliation (ou fin de période après annulation) : retour au plan
        // gratuit. Cet événement ne porte pas `client_reference_id` — d'où la
        // correspondance `stripe_customer_id` stockée à l'achat (migration 0010).
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id ?? null;

        if (!customerId) break;

        const { error } = await adminClient()
          .from("profiles")
          .update({ plan: "free" })
          .eq("stripe_customer_id", customerId);

        if (error) throw new Error(error.message);
        console.log("[stripe] abonnement résilié", customerId);
        break;
      }

      default:
        // Les autres événements sont acquittés sans traitement : répondre 200
        // évite que Stripe les réessaie en boucle.
        break;
    }
  } catch (err) {
    // 500 : Stripe rejouera l'événement. Le traitement est idempotent (on
    // écrit une valeur fixe, on n'incrémente rien), un rejeu est sans risque.
    console.error("[stripe] échec du traitement", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Traitement échoué" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
