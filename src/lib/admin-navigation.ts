export type AdminSection = "environments" | "decks" | "tools";
export type AdminDeckSection = "list" | "create" | "suggestions";

// Existing action redirects and bookmarked filters continue to open their own section.
export function getAdminNavigation(params: { section?: string; deckSection?: string; notice?: string; q?: string; class?: string; active?: string }) {
  const notice = params.notice ?? "";
  const section: AdminSection = ["environments", "decks", "tools"].includes(params.section ?? "")
    ? params.section as AdminSection
    : notice.startsWith("environment") ? "environments"
    : notice || params.q !== undefined || params.class !== undefined || params.active !== undefined ? "decks" : "environments";
  const deckSection: AdminDeckSection = ["list", "create", "suggestions"].includes(params.deckSection ?? "")
    ? params.deckSection as AdminDeckSection
    : notice.startsWith("suggestion_") ? "suggestions"
    : ["created", "create_failed"].includes(notice) ? "create" : "list";
  return { section, deckSection };
}
