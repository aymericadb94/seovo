import LegalLayout from "@/components/LegalLayout";

export const metadata = { title: "Mentions légales — RankPill" };

export default function MentionsLegales() {
  return (
    <LegalLayout title="Mentions légales" lastUpdated="Mars 2026">

      <div className="highlight-box">
        <p style={{ margin: 0 }}>
          Conformément aux dispositions de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l&apos;économie
          numérique (LCEN), les informations suivantes sont portées à la connaissance des utilisateurs du site
          <strong> rankpill.fr</strong>.
        </p>
      </div>

      <h2>1. Éditeur du site</h2>
      <p>
        <strong>Raison sociale :</strong> [NOM DE LA SOCIÉTÉ] <br />
        <strong>Forme juridique :</strong> [SAS / SARL / SASU / Auto-entrepreneur] <br />
        <strong>Capital social :</strong> [MONTANT] € <br />
        <strong>SIRET :</strong> [À COMPLÉTER] <br />
        <strong>RCS :</strong> [VILLE] [NUMÉRO RCS] <br />
        <strong>Siège social :</strong> [ADRESSE COMPLÈTE], [CODE POSTAL] [VILLE], France <br />
        <strong>Email :</strong> <a href="mailto:contact@rankpill.fr">contact@rankpill.fr</a> <br />
        <strong>Directeur de la publication :</strong> [PRÉNOM NOM]
      </p>

      <h2>2. Hébergement</h2>
      <p>
        Le site est hébergé par :<br />
        <strong>Vercel Inc.</strong><br />
        440 N Barranca Ave #4133, Covina, CA 91723, États-Unis<br />
        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a>
      </p>
      <p>
        Les données utilisateurs (base de données) sont hébergées par :<br />
        <strong>Supabase Inc.</strong><br />
        970 Toa Payoh North, #07-04, Singapour 318992<br />
        Serveurs localisés dans l&apos;Union Européenne (région eu-west-1).<br />
        <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a>
      </p>

      <h2>3. Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des éléments composant le site RankPill (textes, graphismes, logiciels, marque, logo, nom
        commercial) sont la propriété exclusive de [NOM DE LA SOCIÉTÉ] ou de ses partenaires et sont protégés par les
        lois françaises et internationales relatives à la propriété intellectuelle.
      </p>
      <p>
        Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie des éléments du
        site, quel que soit le moyen ou le procédé utilisé, est interdite sans l&apos;autorisation écrite préalable de
        [NOM DE LA SOCIÉTÉ].
      </p>

      <h2>4. Responsabilité</h2>
      <p>
        [NOM DE LA SOCIÉTÉ] s&apos;efforce d&apos;assurer l&apos;exactitude et la mise à jour des informations diffusées sur ce
        site. Cependant, [NOM DE LA SOCIÉTÉ] ne peut garantir l&apos;exactitude, la précision ou l&apos;exhaustivité des
        informations mises à disposition sur ce site et décline toute responsabilité pour toute imprécision, inexactitude
        ou omission portant sur des informations disponibles sur ce site.
      </p>

      <h2>5. Cookies</h2>
      <p>
        Le site rankpill.fr utilise des cookies techniques nécessaires au fonctionnement du service (authentification,
        session). Ces cookies ne nécessitent pas de consentement préalable au titre de l&apos;article 82 de la loi
        Informatique et Libertés. Aucun cookie publicitaire ou de tracking tiers n&apos;est déposé.
      </p>

      <h2>6. Droit applicable</h2>
      <p>
        Les présentes mentions légales sont soumises au droit français. En cas de litige, les tribunaux français seront
        seuls compétents.
      </p>

      <h2>7. Contact</h2>
      <p>
        Pour toute question relative au fonctionnement du site ou pour exercer vos droits relatifs à vos données
        personnelles, vous pouvez nous contacter à l&apos;adresse suivante :{" "}
        <a href="mailto:contact@rankpill.fr">contact@rankpill.fr</a>
      </p>

    </LegalLayout>
  );
}
