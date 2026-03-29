import LegalLayout from "@/components/LegalLayout";

export const metadata = { title: "Politique de confidentialité — RankPill" };

export default function Confidentialite() {
  return (
    <LegalLayout title="Politique de confidentialité" lastUpdated="Mars 2026">

      <div className="highlight-box">
        <p style={{ margin: 0 }}>
          RankPill accorde une importance particulière à la protection de vos données personnelles. La présente
          politique est rédigée conformément au <strong>Règlement Général sur la Protection des Données (RGPD)</strong>{" "}
          (UE) 2016/679 et à la loi Informatique et Libertés modifiée.
        </p>
      </div>

      <h2>1. Responsable du traitement</h2>
      <p>
        <strong>[NOM DE LA SOCIÉTÉ]</strong>, [ADRESSE], [CODE POSTAL] [VILLE]<br />
        Email DPO / contact RGPD : <a href="mailto:privacy@rankpill.fr">privacy@rankpill.fr</a>
      </p>

      <h2>2. Données collectées</h2>

      <h3>2.1 Données fournies directement</h3>
      <ul>
        <li>Adresse e-mail (inscription, connexion, communications)</li>
        <li>Numéro de téléphone (optionnel, pour la double authentification)</li>
        <li>Informations relatives à votre site web : nom, secteur d&apos;activité, URL, mots-clés cibles</li>
        <li>Identifiants de connexion CMS (WordPress, Shopify, Wix, API personnalisée) — stockés chiffrés</li>
        <li>Tokens d&apos;accès Google Search Console (stockés chiffrés, jamais transmis au client)</li>
        <li>Date et heure d&apos;acceptation des conditions générales</li>
      </ul>

      <h3>2.2 Données collectées automatiquement</h3>
      <ul>
        <li>Logs de connexion (adresse IP, horodatage, user-agent) — conservés 30 jours</li>
        <li>Données d&apos;utilisation du Service (articles générés, mots-clés utilisés, fréquence de publication)</li>
        <li>Cookies de session strictement nécessaires au fonctionnement (pas de cookies tiers)</li>
      </ul>

      <h2>3. Finalités et bases légales</h2>
      <p>Vos données sont traitées pour les finalités suivantes :</p>
      <ul>
        <li><strong>Exécution du contrat</strong> (art. 6.1.b RGPD) : création et gestion de votre compte, fourniture du Service, publication des articles</li>
        <li><strong>Intérêt légitime</strong> (art. 6.1.f RGPD) : amélioration du Service, prévention de la fraude, sécurité</li>
        <li><strong>Obligation légale</strong> (art. 6.1.c RGPD) : conservation des données de facturation pendant 10 ans</li>
        <li><strong>Consentement</strong> (art. 6.1.a RGPD) : envoi d&apos;e-mails marketing (opt-in, révocable à tout moment)</li>
      </ul>

      <h2>4. Destinataires des données</h2>
      <p>Vos données sont traitées par les sous-traitants suivants, dans le cadre strict de la fourniture du Service :</p>
      <ul>
        <li><strong>Supabase Inc.</strong> — hébergement de la base de données (UE)</li>
        <li><strong>Vercel Inc.</strong> — hébergement de l&apos;application (USA, avec garanties Standard Contractual Clauses)</li>
        <li><strong>Anthropic, PBC</strong> — génération de contenu par IA (USA, SCC)</li>
        <li><strong>Stripe, Inc.</strong> — traitement des paiements (USA, SCC + certifié PCI-DSS)</li>
        <li><strong>Resend, Inc.</strong> — envoi d&apos;e-mails transactionnels (USA, SCC)</li>
        <li><strong>Google LLC</strong> — intégration Google Search Console (USA, SCC)</li>
      </ul>
      <p>
        Vos données ne sont jamais vendues à des tiers. Aucun partage à des fins publicitaires n&apos;est effectué.
      </p>

      <h2>5. Transferts hors UE</h2>
      <p>
        Certains sous-traitants sont établis aux États-Unis. Ces transferts sont encadrés par des Clauses
        Contractuelles Types (CCT) approuvées par la Commission européenne, conformément à l&apos;article 46 du RGPD.
      </p>

      <h2>6. Durée de conservation</h2>
      <ul>
        <li><strong>Données de compte actif :</strong> pendant toute la durée de la relation contractuelle</li>
        <li><strong>Après fermeture du compte :</strong> 3 ans pour les données d&apos;utilisation (prescription civile)</li>
        <li><strong>Données de facturation :</strong> 10 ans (obligation légale, art. L.123-22 Code de commerce)</li>
        <li><strong>Logs de connexion :</strong> 30 jours</li>
        <li><strong>Identifiants CMS :</strong> supprimés dans les 30 jours suivant la fermeture du compte</li>
      </ul>

      <h2>7. Vos droits</h2>
      <p>Conformément au RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li><strong>Droit d&apos;accès</strong> (art. 15) : obtenir une copie de vos données</li>
        <li><strong>Droit de rectification</strong> (art. 16) : corriger des données inexactes</li>
        <li><strong>Droit à l&apos;effacement</strong> (art. 17) : demander la suppression de vos données</li>
        <li><strong>Droit à la limitation</strong> (art. 18) : limiter certains traitements</li>
        <li><strong>Droit à la portabilité</strong> (art. 20) : recevoir vos données dans un format structuré</li>
        <li><strong>Droit d&apos;opposition</strong> (art. 21) : vous opposer à certains traitements</li>
        <li><strong>Retrait du consentement</strong> : à tout moment pour les traitements fondés sur le consentement</li>
      </ul>
      <p>
        Pour exercer vos droits, contactez-nous à :{" "}
        <a href="mailto:privacy@rankpill.fr">privacy@rankpill.fr</a>. Nous répondons dans un délai maximum d&apos;un
        mois. Vous pouvez également déposer une réclamation auprès de la{" "}
        <strong>CNIL</strong> (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>).
      </p>

      <h2>8. Sécurité</h2>
      <p>
        Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données :
        chiffrement TLS en transit, chiffrement au repos des données sensibles (tokens CMS, credentials), authentification
        sécurisée, accès restreint aux données par le personnel.
      </p>

      <h2>9. Cookies</h2>
      <p>
        RankPill utilise uniquement des cookies strictement nécessaires au fonctionnement du Service (gestion de session,
        authentification). Ces cookies ne nécessitent pas de consentement. Aucun cookie publicitaire, analytique tiers
        ou de tracking n&apos;est utilisé.
      </p>

      <h2>10. Modifications</h2>
      <p>
        Toute modification substantielle de la présente politique fera l&apos;objet d&apos;une notification par e-mail
        au moins 15 jours avant son entrée en vigueur.
      </p>

      <h2>11. Contact</h2>
      <p>
        Pour toute question relative à vos données personnelles :{" "}
        <a href="mailto:privacy@rankpill.fr">privacy@rankpill.fr</a>
      </p>

    </LegalLayout>
  );
}
