import { Resend } from "resend";

const FROM = process.env.RESEND_FROM ?? "SeoCorp <onboarding@resend.dev>";

export async function sendArticlePublishedEmail(params: {
  to: string;
  title: string;
  keyword: string;
  url: string;
  businessName: string;
}) {
  const { to, title, keyword, url, businessName } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `✦ Nouvel article publié — ${title}`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1f1f1f;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f97316,#ef4444);padding:32px 40px;">
            <p style="margin:0;font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.5px;">
              SEO<span style="opacity:0.85;">VO</span>
            </p>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">
              Votre assistant SEO automatique
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1px;">
              ✦ Nouvel article publié
            </p>
            <h1 style="margin:0 0 24px;font-size:22px;font-weight:800;color:#fff;line-height:1.3;">
              ${title}
            </h1>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 12px;font-size:12px;color:#666;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Détails</p>
                  <p style="margin:0 0 8px;font-size:14px;color:#ccc;">
                    <span style="color:#666;">Site :</span> <strong style="color:#fff;">${businessName}</strong>
                  </p>
                  <p style="margin:0;font-size:14px;color:#ccc;">
                    <span style="color:#666;">Mot-clé :</span> <strong style="color:#f97316;">${keyword}</strong>
                  </p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ef4444);color:#fff;font-weight:800;font-size:14px;text-decoration:none;padding:14px 32px;border-radius:10px;text-transform:uppercase;letter-spacing:0.5px;">
                    Voir l'article →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1f1f1f;">
            <p style="margin:0;font-size:12px;color:#444;text-align:center;">
              SeoCorp publie automatiquement du contenu SEO sur votre site.<br>
              Vous recevez cet email car un article a été publié sur <strong style="color:#666;">${businessName}</strong>.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
