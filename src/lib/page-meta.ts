/** Shared head() metadata builder for leaf routes. */
export function pageMeta(title: string, description: string, type = "website") {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
    ],
  };
}

export const BRAND = "Her Safety";
export function brandTitle(page: string) {
  return `${page} · ${BRAND} (Demo)`;
}
