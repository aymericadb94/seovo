import LegalLayout from "@/components/LegalLayout";

export const metadata = { title: "Conditions Générales de Vente — RankPill" };

export default function CGV() {
  return (
    <LegalLayout title="Conditions Générales de Vente" lastUpdated="Mars 2026">

      <div className="highlight-box">
        <p style={{ margin: 0 }}>
          Les présentes Conditions Générales de Vente (CGV) s&apos;appliquent à tous les abonnements et achats réalisés
          sur la plateforme <strong>RankPill</strong> (rankpill.fr), éditée par [NOM DE LA SOCIÉTÉ]. Toute commande
          implique l&apos;acceptation sans réserve des présentes CGV.
        </p>
      </div>

      <h2>Article 1 — Identification du vendeur</h2>
      <p>
        <strong>[NOM DE LA SOCIÉTÉ]</strong><br />
        [ADRESSE], [CODE POSTAL] [VILLE], France<br />
        SIRET : [À COMPLÉTER]<br />
        Email : <a href="mailto:contact@rankpill.fr">contact@rankpill.fr</a>
      </p>

      <h2>Article 2 — Offres et tarifs</h2>
      <p>
        RankPill propose des abonnements mensuels ou annuels donnant accès aux fonctionnalités de la plateforme selon
        le plan souscrit. Les tarifs sont indiqués en euros (€) toutes taxes comprises (TTC) et sont disponibles sur la
        page de tarification du site.
      </p>
      <p>
        L&apos;Éditeur se réserve le droit de modifier ses tarifs à tout moment. Les nouveaux tarifs s&apos;appliquent
        aux nouvelles souscriptions et aux renouvellements, après information préalable de l&apos;Utilisateur par e-mail
        au moins 30 jours avant la date de renouvellement.
      </p>

      <h2>Article 3 — Commande et souscription</h2>
      <p>
        La souscription s&apos;effectue en ligne sur rankpill.fr. L&apos;Utilisateur choisit son plan, fournit ses
        coordonnées de paiement et valide sa commande. Un e-mail de confirmation est envoyé à l&apos;adresse fournie
        lors de l&apos;inscription.
      </p>
      <p>
        L&apos;abonnement est conclu pour une durée indéterminée renouvelable par périodes successives (mensuelles ou
        annuelles selon le plan choisi), jusqu&apos;à résiliation par l&apos;une ou l&apos;autre des parties.
      </p>

      <h2>Article 4 — Paiement</h2>
      <p>
        Le paiement est exigible à la date de souscription puis à chaque échéance de renouvellement. Les paiements sont
        traités via <strong>Stripe</strong> (stripe.com), prestataire de services de paiement sécurisé. RankPill ne
        stocke aucune donnée bancaire.
      </p>
      <p>
        En cas d&apos;échec de paiement, l&apos;accès au Service peut être suspendu après un délai de grâce de 7 jours
        et relances par e-mail.
      </p>

      <h2>Article 5 — Droit de rétractation</h2>
      <p>
        Conformément à l&apos;article L.221-18 du Code de la consommation, l&apos;Utilisateur consommateur (personne
        physique n&apos;agissant pas dans un cadre professionnel) dispose d&apos;un délai de <strong>14 jours
        calendaires</strong> à compter de la souscription pour exercer son droit de rétractation, sans avoir à
        justifier de motifs.
      </p>
      <p>
        Pour exercer ce droit, l&apos;Utilisateur doit notifier sa décision par e-mail à{" "}
        <a href="mailto:contact@rankpill.fr">contact@rankpill.fr</a> en indiquant clairement sa volonté de se
        rétracter. Le remboursement sera effectué dans les 14 jours suivant la réception de la notification, via le
        même moyen de paiement utilisé lors de la souscription.
      </p>
      <p>
        <strong>Exception :</strong> Conformément à l&apos;article L.221-28 du Code de la consommation, le droit de
        rétractation ne peut être exercé pour les contrats de fourniture d&apos;un contenu numérique non fourni sur un
        support matériel dont l&apos;exécution a commencé avec l&apos;accord préalable exprès du consommateur. En
        activant immédiatement le Service lors de la souscription, l&apos;Utilisateur reconnaît renoncer à son droit de
        rétractation pour la partie du Service déjà exécutée.
      </p>

      <h2>Article 6 — Résiliation</h2>
      <p>
        L&apos;Utilisateur peut résilier son abonnement à tout moment depuis son espace client ou en contactant le
        support. La résiliation prend effet à la fin de la période d&apos;abonnement en cours, sans remboursement
        prorata des jours non utilisés sauf cas prévu à l&apos;article 5.
      </p>
      <p>
        L&apos;Éditeur peut résilier l&apos;abonnement en cas de violation des CGU ou de non-paiement, après mise en
        demeure par e-mail restée sans effet pendant 8 jours. Dans ce cas, aucun remboursement ne sera effectué.
      </p>

      <h2>Article 7 — Garanties et niveau de service (SLA)</h2>
      <p>
        L&apos;Éditeur s&apos;engage à mettre tout en œuvre pour assurer la disponibilité de la plateforme et la
        qualité du Service. Toutefois, le Service est fourni « en l&apos;état » sans garantie d&apos;un résultat SEO
        particulier. Les performances SEO dépendent de nombreux facteurs externes (algorithmes des moteurs de
        recherche, concurrence, qualité du site de l&apos;Utilisateur) sur lesquels l&apos;Éditeur n&apos;a aucun contrôle.
      </p>

      <h2>Article 8 — Force majeure</h2>
      <p>
        L&apos;Éditeur ne saurait être tenu responsable de l&apos;inexécution de ses obligations en cas de force majeure
        au sens de l&apos;article 1218 du Code civil, notamment en cas de panne des infrastructures d&apos;hébergement,
        de cyberattaque ou d&apos;indisponibilité d&apos;API tierces (OpenAI, Google, etc.).
      </p>

      <h2>Article 9 — Médiation</h2>
      <p>
        Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, l&apos;Éditeur propose un dispositif
        de médiation de la consommation. En cas de litige non résolu amiablement, l&apos;Utilisateur consommateur peut
        saisir gratuitement le médiateur compétent. Coordonnées du médiateur : [À COMPLÉTER].
      </p>
      <p>
        La Commission européenne met également à disposition une plateforme de règlement en ligne des litiges (RLL) :{" "}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
          ec.europa.eu/consumers/odr
        </a>
      </p>

      <h2>Article 10 — Droit applicable</h2>
      <p>
        Les présentes CGV sont soumises au droit français. En cas de litige, et à défaut de résolution amiable, les
        juridictions du ressort de [VILLE DU SIÈGE SOCIAL] seront seules compétentes.
      </p>

    </LegalLayout>
  );
}
