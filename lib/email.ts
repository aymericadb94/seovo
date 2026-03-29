import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_HELLO        = "RankPill <hello@rankpill.fr>";
const FROM_SUBSCRIPTION = "RankPill <subscription@rankpill.fr>";
const FROM_NOREPLY      = "RankPill <noreply@rankpill.fr>";

// ─── Template de base ────────────────────────────────────────────────────────

function baseTemplate(content: string, preheader = "") {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>RankPill</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#080808;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:48px 20px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <!-- Logo -->
        <tr>
          <td style="padding-bottom:32px;" align="center">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg,#f97316,#ef4444);border-radius:12px;padding:10px 20px;">
                  <span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.5px;text-decoration:none;">Rank<span style="opacity:0.85;">Pill</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#0f0f0f;border:1px solid #1e1e1e;border-radius:20px;overflow:hidden;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 0 0;text-align:center;">
            <p style="margin:0 0 8px;font-size:12px;color:#333;">
              © ${new Date().getFullYear()} RankPill · <a href="https://www.rankpill.fr" style="color:#444;text-decoration:none;">rankpill.fr</a>
            </p>
            <p style="margin:0;font-size:11px;color:#2a2a2a;">
              Vous recevez cet email car vous avez un compte RankPill.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Section header colorée ───────────────────────────────────────────────────

function cardHeader(label: string, title: string, subtitle?: string) {
  return `
    <tr>
      <td style="background:linear-gradient(135deg,#1a0a00,#1a0505);border-bottom:1px solid #1e1e1e;padding:36px 40px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:2px;">${label}</p>
        <h1 style="margin:0;font-size:26px;font-weight:900;color:#fff;line-height:1.25;letter-spacing:-0.5px;">${title}</h1>
        ${subtitle ? `<p style="margin:10px 0 0;font-size:15px;color:#888;line-height:1.5;">${subtitle}</p>` : ""}
      </td>
    </tr>`;
}

// ─── Bouton CTA ───────────────────────────────────────────────────────────────

function ctaButton(label: string, url: string) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding-top:8px;">
          <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ef4444);color:#fff;font-weight:800;font-size:14px;text-decoration:none;padding:15px 36px;border-radius:12px;letter-spacing:0.3px;">${label} →</a>
        </td>
      </tr>
    </table>`;
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function infoRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #1a1a1a;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#555;">${label}</td>
            <td style="font-size:13px;color:#fff;font-weight:600;text-align:right;">${value}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// ─── 1. Email de bienvenue (Inscription) ─────────────────────────────────────

export async function sendWelcomeEmail(params: { to: string; firstName?: string }) {
  const { to, firstName } = params;
  const name = firstName ?? "là";

  const content = `
    ${cardHeader("Bienvenue", `Bienvenue sur RankPill${firstName ? `, ${firstName}` : ""} 🎉`, "Votre SEO automatisé commence maintenant.")}
    <tr>
      <td style="padding:36px 40px;">
        <p style="margin:0 0 20px;font-size:15px;color:#aaa;line-height:1.7;">
          Bonjour ${name},<br><br>
          Votre compte RankPill est prêt. En quelques minutes, vous allez connecter votre site et laisser RankPill générer du contenu SEO optimisé — chaque jour, automatiquement.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:24px 28px;">
            <p style="margin:0 0 16px;font-size:12px;color:#555;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Ce qui vous attend</p>
            <p style="margin:0 0 10px;font-size:14px;color:#ccc;">✦&nbsp; Analyse SEO de votre site</p>
            <p style="margin:0 0 10px;font-size:14px;color:#ccc;">✦&nbsp; Génération automatique de mots-clés</p>
            <p style="margin:0;font-size:14px;color:#ccc;">✦&nbsp; Publication quotidienne d'articles optimisés</p>
          </td></tr>
        </table>

        ${ctaButton("Commencer l'onboarding", "https://www.rankpill.fr/onboarding")}
      </td>
    </tr>`;

  await resend.emails.send({
    from: FROM_HELLO,
    to,
    subject: "Bienvenue sur RankPill — votre SEO automatique commence",
    html: baseTemplate(content, "Votre compte est prêt. Connectez votre site en 5 minutes."),
  });
}

// ─── 2. Confirmation de changement de mot de passe ───────────────────────────

export async function sendPasswordChangedEmail(params: { to: string }) {
  const { to } = params;
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const content = `
    ${cardHeader("Sécurité", "Mot de passe modifié", "Votre mot de passe a été changé avec succès.")}
    <tr>
      <td style="padding:36px 40px;">
        <p style="margin:0 0 24px;font-size:15px;color:#aaa;line-height:1.7;">
          Votre mot de passe RankPill a été modifié le <strong style="color:#fff;">${date}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:20px 28px;">
            <p style="margin:0;font-size:14px;color:#f97316;line-height:1.6;">
              ⚠ Ce n'est pas vous ? Contactez-nous immédiatement à <a href="mailto:hello@rankpill.fr" style="color:#f97316;">hello@rankpill.fr</a>
            </p>
          </td></tr>
        </table>

        ${ctaButton("Accéder à mon compte", "https://www.rankpill.fr/dashboard")}
      </td>
    </tr>`;

  await resend.emails.send({
    from: FROM_NOREPLY,
    to,
    subject: "Votre mot de passe RankPill a été modifié",
    html: baseTemplate(content, "Votre mot de passe a été changé. Ce n'est pas vous ? Contactez-nous."),
  });
}

// ─── 3. Récap onboarding ─────────────────────────────────────────────────────

export async function sendOnboardingRecapEmail(params: {
  to: string;
  businessName: string;
  siteUrl: string;
  cms: string;
  keywords: string[];
}) {
  const { to, businessName, siteUrl, cms, keywords } = params;
  const topKeywords = keywords.slice(0, 5).join(", ");

  const content = `
    ${cardHeader("Onboarding terminé", `${businessName} est prêt à ranker 🚀`, "Voici un récapitulatif de votre configuration.")}
    <tr>
      <td style="padding:36px 40px;">
        <p style="margin:0 0 24px;font-size:15px;color:#aaa;line-height:1.7;">
          Votre site est connecté et la génération automatique d'articles va démarrer. Voici ce que RankPill a configuré pour vous :
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${infoRow("Site", siteUrl)}
              ${infoRow("CMS", cms.charAt(0).toUpperCase() + cms.slice(1))}
              ${infoRow("Mots-clés ciblés", `${keywords.length} mots-clés`)}
              ${infoRow("Top mots-clés", topKeywords || "—")}
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:20px 28px;">
            <p style="margin:0;font-size:13px;color:#666;line-height:1.6;">
              Le premier article sera publié lors du prochain cycle cron. Vous recevrez une notification à chaque publication.
            </p>
          </td></tr>
        </table>

        ${ctaButton("Voir mon dashboard", "https://www.rankpill.fr/dashboard")}
      </td>
    </tr>`;

  await resend.emails.send({
    from: FROM_HELLO,
    to,
    subject: `${businessName} est configuré — RankPill démarre`,
    html: baseTemplate(content, `${businessName} est prêt. Le premier article arrive bientôt.`),
  });
}

// ─── 4. Mouvement SEO — article publié ───────────────────────────────────────

export async function sendArticlePublishedEmail(params: {
  to: string;
  title: string;
  keyword: string;
  url: string;
  businessName: string;
}) {
  const { to, title, keyword, url, businessName } = params;
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const content = `
    ${cardHeader("Mouvement SEO", "Nouvel article publié", businessName)}
    <tr>
      <td style="padding:36px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:24px 28px;">
            <p style="margin:0 0 4px;font-size:11px;color:#555;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Article</p>
            <p style="margin:0 0 20px;font-size:17px;font-weight:700;color:#fff;line-height:1.4;">${title}</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${infoRow("Mot-clé ciblé", `<span style="color:#f97316;">${keyword}</span>`)}
              ${infoRow("Publié le", date)}
              ${infoRow("Site", businessName)}
            </table>
          </td></tr>
        </table>

        ${ctaButton("Voir l'article", url)}

        <p style="margin:28px 0 0;font-size:13px;color:#444;text-align:center;line-height:1.6;">
          RankPill publie automatiquement du contenu SEO sur votre site.<br>
          <a href="https://www.rankpill.fr/dashboard" style="color:#555;text-decoration:none;">Voir tous mes articles</a>
        </p>
      </td>
    </tr>`;

  await resend.emails.send({
    from: FROM_NOREPLY,
    to,
    subject: `✦ Article publié — ${title}`,
    html: baseTemplate(content, `Un nouvel article SEO vient d'être publié sur ${businessName}.`),
  });
}

// ─── 5a. Nouvel abonnement ────────────────────────────────────────────────────

export async function sendNewSubscriptionEmail(params: {
  to: string;
  plan: string;
  priceHT: number;
  priceTTC: number;
  billingDate: string;
}) {
  const { to, plan, priceHT, priceTTC, billingDate } = params;

  const content = `
    ${cardHeader("Abonnement", `Bienvenue sur le plan ${plan} 🎉`, "Votre abonnement RankPill est actif.")}
    <tr>
      <td style="padding:36px 40px;">
        <p style="margin:0 0 24px;font-size:15px;color:#aaa;line-height:1.7;">
          Merci pour votre confiance. Voici le récapitulatif de votre abonnement :
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${infoRow("Plan", plan)}
              ${infoRow("Montant HT", `${priceHT.toFixed(2)} €`)}
              ${infoRow("TVA (20%)", `${(priceTTC - priceHT).toFixed(2)} €`)}
              ${infoRow("Montant TTC", `<strong style="color:#f97316;">${priceTTC.toFixed(2)} €</strong>`)}
              ${infoRow("Prochain renouvellement", billingDate)}
            </table>
          </td></tr>
        </table>

        ${ctaButton("Accéder à mon espace", "https://www.rankpill.fr/dashboard")}

        <p style="margin:24px 0 0;font-size:13px;color:#444;text-align:center;">
          Une facture détaillée est disponible dans vos <a href="https://www.rankpill.fr/settings" style="color:#555;text-decoration:none;">paramètres de compte</a>.
        </p>
      </td>
    </tr>`;

  await resend.emails.send({
    from: FROM_SUBSCRIPTION,
    to,
    subject: `Abonnement ${plan} confirmé — RankPill`,
    html: baseTemplate(content, `Votre abonnement ${plan} est actif. Merci !`),
  });
}

// ─── 5b. Facture mensuelle ────────────────────────────────────────────────────

export async function sendInvoiceEmail(params: {
  to: string;
  invoiceNumber: string;
  plan: string;
  period: string;
  priceHT: number;
  priceTTC: number;
}) {
  const { to, invoiceNumber, plan, period, priceHT, priceTTC } = params;
  const tva = priceTTC - priceHT;

  const content = `
    ${cardHeader("Facture", `Facture ${invoiceNumber}`, `Période : ${period}`)}
    <tr>
      <td style="padding:36px 40px;">

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:24px 28px;">
            <p style="margin:0 0 16px;font-size:12px;color:#555;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Détail de la facture</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${infoRow("N° Facture", invoiceNumber)}
              ${infoRow("Plan", plan)}
              ${infoRow("Période", period)}
              ${infoRow("Montant HT", `${priceHT.toFixed(2)} €`)}
              ${infoRow("TVA (20%)", `${tva.toFixed(2)} €`)}
            </table>
            <!-- Total -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;padding-top:12px;border-top:1px solid #2a2a2a;">
              <tr>
                <td style="font-size:15px;font-weight:700;color:#fff;">Total TTC</td>
                <td style="font-size:18px;font-weight:900;color:#f97316;text-align:right;">${priceTTC.toFixed(2)} €</td>
              </tr>
            </table>
          </td></tr>
        </table>

        ${ctaButton("Télécharger la facture", "https://www.rankpill.fr/settings?tab=billing")}
      </td>
    </tr>`;

  await resend.emails.send({
    from: FROM_SUBSCRIPTION,
    to,
    subject: `Facture ${invoiceNumber} — RankPill`,
    html: baseTemplate(content, `Votre facture ${invoiceNumber} est disponible.`),
  });
}

// ─── 6. Désabonnement ─────────────────────────────────────────────────────────

export async function sendUnsubscribeEmail(params: {
  to: string;
  plan: string;
  endDate: string;
}) {
  const { to, plan, endDate } = params;

  const content = `
    ${cardHeader("Abonnement", "Votre abonnement a été annulé", `Plan ${plan}`)}
    <tr>
      <td style="padding:36px 40px;">
        <p style="margin:0 0 24px;font-size:15px;color:#aaa;line-height:1.7;">
          Nous avons bien pris en compte l'annulation de votre abonnement RankPill. Vous conservez l'accès à toutes les fonctionnalités jusqu'au <strong style="color:#fff;">${endDate}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${infoRow("Plan annulé", plan)}
              ${infoRow("Accès jusqu'au", endDate)}
              ${infoRow("Renouvellement", "Annulé")}
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:14px;margin-bottom:28px;">
          <tr><td style="padding:20px 28px;text-align:center;">
            <p style="margin:0 0 12px;font-size:14px;color:#888;">Vous avez changé d'avis ?</p>
            <a href="https://www.rankpill.fr/settings?tab=billing" style="font-size:14px;font-weight:700;color:#f97316;text-decoration:none;">Réactiver mon abonnement →</a>
          </td></tr>
        </table>

        <p style="margin:0;font-size:13px;color:#444;text-align:center;line-height:1.6;">
          Une question ? Contactez-nous à <a href="mailto:hello@rankpill.fr" style="color:#555;text-decoration:none;">hello@rankpill.fr</a>
        </p>
      </td>
    </tr>`;

  await resend.emails.send({
    from: FROM_SUBSCRIPTION,
    to,
    subject: `Votre abonnement RankPill a été annulé`,
    html: baseTemplate(content, `Accès conservé jusqu'au ${endDate}. On espère vous revoir.`),
  });
}
