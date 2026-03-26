import Link from "next/link";

const features = [
  {
    icon: "✍️",
    title: "Articles de blog SEO",
    description: "Des articles longs, structurés et optimisés pour vos mots-clés cibles. Publiés automatiquement chaque jour.",
  },
  {
    icon: "🏷️",
    title: "Méta-descriptions & titres",
    description: "Chaque page optimisée avec les balises title et meta description idéales pour dominer Google.",
  },
  {
    icon: "🔗",
    title: "Maillage interne",
    description: "L'IA crée des liens intelligents entre vos pages pour renforcer votre autorité SEO.",
  },
  {
    icon: "📊",
    title: "Analyse de mots-clés",
    description: "Identification automatique des opportunités SEO à fort potentiel dans votre secteur.",
  },
  {
    icon: "🔄",
    title: "Publication automatique",
    description: "1 nouveau contenu publié chaque jour sur votre site, sans aucune intervention.",
  },
  {
    icon: "📈",
    title: "Rapport mensuel",
    description: "Suivez l'évolution de votre trafic organique avec des rapports clairs et actionnables.",
  },
];

const steps = [
  {
    number: "01",
    title: "Connectez votre site",
    description: "WordPress ou Shopify — la connexion prend moins de 2 minutes.",
  },
  {
    number: "02",
    title: "L'IA analyse votre secteur",
    description: "SEOVO identifie les mots-clés à fort potentiel pour votre activité.",
  },
  {
    number: "03",
    title: "Les contenus se publient seuls",
    description: "Chaque jour, un nouvel article optimisé apparaît sur votre site.",
  },
];

const plans = [
  {
    name: "Starter",
    price: "49",
    description: "Pour les indépendants et petites entreprises",
    features: ["1 site connecté", "30 articles / mois", "WordPress ou Shopify", "Tableau de bord"],
    cta: "Commencer",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "99",
    description: "Pour les entreprises en croissance",
    features: ["3 sites connectés", "90 articles / mois", "WordPress + Shopify", "Tableau de bord", "Rapport mensuel", "Support prioritaire"],
    cta: "Commencer",
    highlighted: true,
  },
  {
    name: "Agence",
    price: "299",
    description: "Pour les agences et grands comptes",
    features: ["Sites illimités", "Articles illimités", "WordPress + Shopify", "Tableau de bord avancé", "Rapports personnalisés", "Account manager dédié"],
    cta: "Nous contacter",
    highlighted: false,
  },
];

const testimonials = [
  {
    name: "Sophie M.",
    role: "Fondatrice, Boutique Léonie",
    content: "En 3 mois, mon trafic organique a augmenté de 340%. Je n'ai rien eu à faire — SEOVO s'est occupé de tout.",
    avatar: "S",
  },
  {
    name: "Thomas R.",
    role: "Directeur Marketing, TechFlow",
    content: "On économise 15h par semaine sur la création de contenu. Le ROI est évident dès le premier mois.",
    avatar: "T",
  },
  {
    name: "Camille D.",
    role: "CEO, Studio Créatif",
    content: "La qualité des articles générés est bluffante. Nos clients pensent qu'on a une équipe de rédacteurs SEO.",
    avatar: "C",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-black text-white min-h-screen">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">
            SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
          </span>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#comment" className="hover:text-white transition-colors">Comment ça marche</a>
            <a href="#fonctionnalites" className="hover:text-white transition-colors">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-white transition-colors">Tarifs</a>
          </div>
          <Link
            href="/signup"
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-all shadow-lg shadow-orange-500/20"
          >
            Essayer gratuitement
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-36 pb-28 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[700px] h-[700px] bg-orange-600/10 rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
          <div className="w-[500px] h-[300px] bg-red-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium px-4 py-2 rounded-full mb-8">
            <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            Propulsé par l&apos;IA la plus avancée au monde
          </div>
          <h1 className="text-6xl md:text-8xl font-black leading-none tracking-tight mb-6">
            Dominez Google.{" "}
            <br />
            <span className="bg-gradient-to-r from-orange-400 via-red-400 to-red-500 bg-clip-text text-transparent">
              Automatiquement.
            </span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            SEOVO génère et publie chaque jour des contenus SEO optimisés sur votre site.
            Sans rédacteur. Sans agence. Sans effort.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black px-10 py-4 rounded-xl text-lg transition-all shadow-xl shadow-orange-500/25 uppercase tracking-wide"
            >
              Démarrer maintenant →
            </Link>
            <a
              href="#comment"
              className="text-gray-400 hover:text-white font-medium px-8 py-4 rounded-xl transition-colors border border-white/10 hover:border-white/20"
            >
              Voir comment ça marche
            </a>
          </div>
          <p className="text-gray-600 text-sm mt-6">Sans engagement • Premiers résultats en 48h</p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 border-y border-white/5">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "+340%", label: "de trafic organique moyen" },
            { value: "1 article", label: "publié chaque jour" },
            { value: "2 min", label: "pour connecter votre site" },
            { value: "0h", label: "de travail manuel" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl md:text-4xl font-black text-white mb-1">{stat.value}</p>
              <p className="text-gray-500 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment" className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Comment ça marche</h2>
            <p className="text-gray-400 text-lg">Trois étapes. Zéro complexité.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="text-7xl font-black bg-gradient-to-b from-white/10 to-transparent bg-clip-text text-transparent mb-4 leading-none">
                  {step.number}
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="py-28 px-6 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Tout ce dont votre SEO a besoin</h2>
            <p className="text-gray-400 text-lg">L&apos;IA couvre chaque aspect du référencement naturel.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group"
              >
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-bold mb-2 group-hover:text-orange-400 transition-colors">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Témoignages */}
      <section className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Ils ont transformé leur SEO</h2>
            <p className="text-gray-400 text-lg">Des résultats concrets, dès les premières semaines.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
                <p className="text-gray-300 leading-relaxed mb-6">&ldquo;{t.content}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center font-bold text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{t.name}</p>
                    <p className="text-gray-500 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tarifs */}
      <section id="tarifs" className="py-28 px-6 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Tarifs simples et transparents</h2>
            <p className="text-gray-400 text-lg">Sans frais cachés. Sans mauvaises surprises.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? "bg-gradient-to-b from-orange-500/20 to-red-500/10 border-2 border-orange-500/50 shadow-xl shadow-orange-500/10"
                    : "bg-white/[0.03] border border-white/[0.07]"
                }`}
              >
                {plan.highlighted && (
                  <span className="text-xs font-black bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full w-fit mb-4 uppercase tracking-wider">
                    Le plus populaire
                  </span>
                )}
                <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-400 mb-6">{plan.description}</p>
                <div className="mb-6">
                  <span className={`text-5xl font-black ${plan.highlighted ? "text-orange-400" : "text-white"}`}>
                    {plan.price}€
                  </span>
                  <span className="text-sm text-gray-400 ml-1">/mois</span>
                </div>
                <ul className="flex flex-col gap-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="text-orange-400 font-bold">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`text-center font-black py-3 rounded-xl transition-all uppercase tracking-wide text-sm ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg shadow-orange-500/20"
                      : "bg-white/[0.07] hover:bg-white/[0.12] text-white"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-28 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[400px] bg-orange-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-black mb-6 tracking-tight leading-none">
            Prêt à dominer{" "}
            <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
              Google
            </span>{" "}
            ?
          </h2>
          <p className="text-gray-400 text-xl mb-10">
            Rejoignez les entreprises qui ont automatisé leur SEO et regardent leur trafic exploser.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black px-12 py-5 rounded-xl text-xl transition-all shadow-2xl shadow-orange-500/30 uppercase tracking-wide"
          >
            Démarrer gratuitement →
          </Link>
          <p className="text-gray-600 text-sm mt-5">Sans carte bancaire • Annulable à tout moment</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-lg font-black tracking-tight">
            SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
          </span>
          <p className="text-gray-600 text-sm">© 2025 SEOVO. Tous droits réservés.</p>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-white transition-colors">Confidentialité</a>
            <a href="#" className="hover:text-white transition-colors">CGU</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
