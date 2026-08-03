# UX/Monétisation — Parcours complet

> Réflexion sur l'expérience utilisateur à chaque moment de friction (quota atteint, upgrade, etc.)

---

## 1. Premier accès — Nouveau compte

### État : Compte créé, plan=free, 0 biens, 0 analyses

**Page d'accueil (`/`)**
```
EmptyHomeState actuel :
✅ "Colle une annonce" → formulaire d'ajout
❌ Manque : communication du plan / limite

Suggestion :
┌─────────────────────────────────────┐
│ Immo<score>                         │
├─────────────────────────────────────┤
│ Content de te revoir!               │
│ Tu es en Plan Gratuit (1 bien)      │  ← Badge doré
├─────────────────────────────────────┤
│ Colle une annonce                   │
│ [Champ URL + bouton Analyser]       │
│                                     │
│ Les trois étapes du produit         │
└─────────────────────────────────────┘
```

**Navbar**
```
En haut à droite, après le UserMenu :
├─ Avatar + email
└─ Badge "Plan Gratuit" 
   └─ Au clic : lien vers page compte (affiche plan, limite, bouton contact)
```

---

## 2. Premier bien ajouté — Pas d'analyse encore

### État : 1 bien créé, plan=free

**Home après ajout**
```
┌─ [Plan Gratuit] 1/1 bien ────────┐
│                                  │
│ Mes biens (1)                    │
├──────────────────────────────────┤
│ [Bien 1]                         │
│ Analyse : Non lancée             │
│ ► Lancer l'analyse               │
└──────────────────────────────────┘
```

**Au clic "Lancer l'analyse"**
```
Succès → affiche l'Analyse IA
Puis au bas : badge "1ère analyse gratuite offerte ✓"
```

---

## 3. Tentative d'ajouter un 2e bien — BLOCAGE

### État : plan=free, déjà 1 bien, tente POST /api/apartments

**Flux**
```
1. Utilisateur clique "Ajouter un bien"
2. Route /appartements/nouveau chargée
3. Formulaire rempli + clic "Enregistrer"
4. POST /api/apartments → 403 QUOTA_EXCEEDED
5. Redirect vers /upgrade/bien-limite?suivant=/appartements/nouveau
```

**Page `/upgrade/bien-limite` (PAGE CONTEXTUELLE)**
```
┌──────────────────────────────────┐
│ Immoscore                        │
├──────────────────────────────────┤
│ 📦 Débloquez les biens illimités│
│                                  │
│ Vous avez atteint la limite      │
│ de 1 bien avec le plan Gratuit.  │
│                                  │
│ Avec Pro (5,99 €/mois) :         │
│ ✓ Illimités biens                │
│ ✓ 50 analyses IA/mois            │
│ ✓ Support email                  │
│                                  │
│ Facturation flexible, annulez    │
│ à tout moment.                   │
│                                  │
├──────────────────────────────────┤
│ [Passer à Pro via Stripe]        │
│ [Retour à mon bien]              │
└──────────────────────────────────┘
```

**Copy — Ton doux, pas agressif**
```
❌ "DÉBLOQUEZ MAINTENANT"
✅ "Vous avez atteint la limite..."

❌ "MANQUEZ PLUS"
✅ "Avec Pro, vous pouvez..."
```

**Button Stripe**
```
[Passer à Pro via Stripe]
└─ Link vers Stripe payment link
   └─ Après paiement → webhook update plan=pro
   └─ Redirect vers /appartements/nouveau?follow=bien (relance l'ajout)
```

---

## 4. Tentative de 2e analyse — BLOCAGE

### État : plan=free, déjà 1 bien analysé, tente POST /api/analyse/[id]

**Flux**
```
1. Utilisateur clique bouton "Relancer l'analyse"
2. POST /api/analyse/[id] → 403 ANALYSE_QUOTA_EXCEEDED
3. Redirect vers /upgrade/analyse-limite?suivant=/appartements/[id]
```

**Page `/upgrade/analyse-limite` (PAGE CONTEXTUELLE)**
```
┌──────────────────────────────────┐
│ Immoscore                        │
├──────────────────────────────────┤
│ 🔍 Débloquez plus d'analyses     │
│                                  │
│ Vous avez utilisé votre          │
│ analyse gratuite ce mois.        │
│                                  │
│ Avec Pro (5,99 €/mois) :         │
│ ✓ 50 analyses IA/mois            │
│ ✓ Biens illimités                │
│ ✓ Support email                  │
│                                  │
│ Prochaine analyse gratuite :     │
│ 1er septembre                    │
│                                  │
├──────────────────────────────────┤
│ [Passer à Pro via Stripe]        │
│ [Retour au bien]                 │
└──────────────────────────────────┘
```

**Copy — Ton doux**
```
❌ "Limite atteinte ! Débloquez maintenant"
✅ "Vous avez utilisé votre analyse gratuite ce mois"

Message reste positif + donne le prochain reset
```

---

## 5. Page `/compte` — Affichage du plan (déjà Lot 4)

### État : Affiche plan + biens + analyses

**Conteneur **Plan** (existing)**
```
┌─────────────────────────────────┐
│ 🎯 Plan                         │
│ Gratuit                         │
│ Upgrade disponible              │ ← CTA change ici
└─────────────────────────────────┘
```

**CTA Upgrade — TROIS cas**

### Cas 1 : Plan free
```
CTA Button : "Passer à Pro"
└─ Ouvre modale contact / landing
```

### Cas 2 : Plan pro
```
Badge : "Pro ✓"
└─ Pas de CTA (déjà abonné)
```

### Cas 3 : Plan tester
```
Badge : "Testeur (merci!)"
└─ Pas de CTA (illlimité)
```

---

## 6. Intégration Stripe — Architecture

### Stripe Payment Link (le plus simple)

```
1. Créer produit "Pro" dans Stripe Dashboard
   - Prix : 5,99 €/mois récurrent
   - Trial : optionnel (7 jours ?)

2. Générer un Payment Link
   → https://buy.stripe.com/xxxxx

3. Configurer webhook Stripe
   → POST /api/stripe/webhook
   → Événement : checkout.session.completed
   → Action : UPDATE profiles SET plan='pro' WHERE email = ...

4. Après paiement
   → Redirect success_url = /upgrade/success?suivant=...
   → Ou : Stripe redirige directement
```

### Flux complet

```
User clique "Passer à Pro"
  ↓
Redirect vers Stripe Payment Link
  ↓
User paie (Stripe Checkout)
  ↓
Stripe → webhook → notre serveur
  ↓
UPDATE profiles SET plan='pro'
  ↓
Redirect user vers /upgrade/success
  ↓
"Merci ! Votre plan est actif ✓"
  ↓
Bouton "Continuer" → reprend le flux
```

### Route webhook nécessaire

```typescript
// src/app/api/stripe/webhook/route.ts
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const event = stripe.webhooks.constructEvent(body, sig, secret);
  
  if (event.type === "checkout.session.completed") {
    const email = event.data.object.customer_email;
    // UPDATE profiles SET plan='pro' WHERE email = ?
  }
}
```

### Gestion des annulations

```
Événement Stripe : customer.subscription.deleted
Action : UPDATE profiles SET plan='free'
Message user : "Votre abonnement Pro a expiré"
```

---

## 7. Email de bienvenue — Onboarding

### À l'inscription (Server Action `inscription`)

**Sujet** : Bienvenue sur Immoscore ! 👋

**Contenu**
```
Salut [prenom],

Bienvenue sur Immoscore.

Ton compte gratuit t'offre :
• 1 bien à analyser
• 1 analyse IA complète

Les analyses démarrent le 1er du mois suivant.

👉 Colle une annonce pour commencer
   [Link vers /appartements/nouveau?suivant=/analyse]

Questions ? Nous contacter
Immoscore
```

---

## 8. Email "Limite atteinte" — Upsell

### Au 2e bien / 51e analyse (future automation)

**Sujet** : Débloquez les analyses illimitées 🚀

**Contenu**
```
Salut [prenom],

Tu as adoré analyser tes biens ?
Passe à Pro pour débloquer :
• Biens illimités
• 50 analyses/mois (presque jamais atteint 😄)

5,99 €/mois. Facturé mensuellement.

[Passer à Pro]

Ou nous contacter pour des questions
```

---

## 9. Écran "Quota atteint" — Page dédiée (optionnel)

### Rare : utilisateur atteint 50 analyses en Pro

**Page** : `/compte?tab=analyses`
```
┌─────────────────────────────────┐
│ Analyses ce mois                │
│ 50/50 ✓                         │
├─────────────────────────────────┤
│ Prochain renouvellement :       │
│ 1er septembre                   │
│                                 │
│ Besoin de plus d'analyses ?     │
│ Nous contacter                  │
└─────────────────────────────────┘
```

---

## 10. Progression graduelle — Copy pour chaque étape

### État 1 : Nouveau compte (plan=free, 0/1 bien)
```
Messaging : "Analyse 1 bien gratuitement"
Tone : Invitant, pas menacé
```

### État 2 : 1 bien créé (plan=free, 1/1 bien)
```
Messaging : "Tu as 0/1 bien utilisé"
Tone : Neutre, informatif
```

### État 3 : Limite atteinte (plan=free, 1/1 bien)
```
Messaging : "Passe à Pro pour débloquer"
Tone : Opportunité, non urgent
```

### État 4 : Plan Pro (plan=pro, X/∞ bien)
```
Messaging : "Pro illimité, merci !"
Tone : Gratitude, empowerment
```

---

## 11. Points de friction à anticiper

### A. Confusion "analyses" vs "biens"
```
❌ Utilisateur : "Je peux ajouter des biens mais pas les analyser ?"
✅ Solution : Message clair dès le blocage

"Limit 1 bien gratuit.
 Tu peux toujours l'analyser (1/mois).
 Passe à Pro pour + de biens."
```

### B. "Pourquoi ma 2e analyse est bloquée ?"
```
❌ Utilisateur free : "J'ai qu'1 bien, pourquoi pas d'analyses ?"
✅ Solution : Page /compte affiche clairement

"Plan Gratuit
 • 1 bien (1/1)
 • 1 analyse/mois (1/1)
 Passe à Pro pour 50/mois"
```

### C. Perception de prix
```
❌ "Pourquoi payer pour analyser ? Ailleurs c'est gratuit"
✅ Solution : Email post-signup explique la valeur

"Nos analyses combinent :
 • Data officielle (DVF, ADEME, géorisques)
 • IA pour chaque bien
 • Recommandations d'optimisation
 
 5,99 € = quelques minutes de rental income 💰"
```

---

## 12. Flux complet résumé en schéma

```
┌─── INSCRIPTION ───┐
│                   │
│ Email bienvenue   │ (Lot 6)
│ + "1 bien free"   │
└────────┬──────────┘
         │
         ▼
┌─── 1ER BIEN ──────┐
│ POST /api/apts    │
│ ✅ 200 OK         │
│ "1/1 bien utilisé"│
└────────┬──────────┘
         │
         ▼
┌─── 1ER BIEN x2 ───┐
│ POST /api/apts    │
│ ❌ 403 Quota      │
│ Modale upgrade    │
└────────┬──────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
 Pro      Rester free
  │
  ▼
┌─── PRO ──────────┐
│ Biens illimités  │
│ 50 analyses/mois │
└──────────────────┘
```

---

## 13. Décisions prises

| Question | Choix | Raison |
|----------|-------|--------|
| Modale ou page ? | **Page contextuelle** | Contexte complet, shareable, moins intrusif |
| Fréquence d'upsell ? | **Chaque blocage** | Moment où la valeur est ressentie |
| Ton ? | **Doux** | Pas de pression, informatif |
| Paiement ? | **Stripe** | Self-serve dès le début |

---

## 14. Pages à créer

| Route | Contenu | Effort |
|-------|---------|--------|
| `/upgrade/bien-limite` | Blocage 2e bien | 45 min |
| `/upgrade/analyse-limite` | Blocage analyse | 45 min |
| `/upgrade/success` | Confirmation post-Stripe | 20 min |
| `/api/stripe/webhook` | Handler paiement | 1h |

**Composant partagé** : `UpgradePage.tsx` (layout commun, contenu variable)

---

## 15. Récap effort total

| Poste | Effort | Notes |
|-------|--------|-------|
| Pages upgrade (×3) | 2h | Layout partagé |
| Webhook Stripe | 1h | + config dashboard |
| Redirect logic (API) | 30 min | Sur 403, rediriger |
| Badge plan navbar/home | 30 min | Optionnel |
| Emails | 2h | Lot 6 |

**Total Lot 5 UI : ~4h** (hors emails)

---

## 16. Prérequis Stripe

Avant de coder :
- [ ] Compte Stripe créé
- [ ] Produit "Pro" configuré (5,99 €/mois)
- [ ] Payment Link généré
- [ ] Webhook secret récupéré
- [ ] Variables d'env : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`

---

Prêt à coder ? 🚀
