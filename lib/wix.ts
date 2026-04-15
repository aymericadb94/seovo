/**
 * Re-export depuis le module Wix isolé.
 * Ce fichier existe uniquement pour la compatibilité des imports existants.
 * Toute la logique Wix est dans lib/platforms/wix.ts
 */
export {
  htmlToRicos,
  publishToWix,
  analyzeWixSite,
  testWixConnection,
} from "@/lib/platforms/wix";
