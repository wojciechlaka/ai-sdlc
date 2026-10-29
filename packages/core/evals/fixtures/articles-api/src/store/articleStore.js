/** In-memory store of articles, keyed by slug. */
const articles = new Map()

module.exports = {
  all: () => [...articles.values()],
  find: (slug) => articles.get(slug) || null,
  save: (article) => {
    articles.set(article.slug, article)
  },
  remove: (slug) => articles.delete(slug),
  clear: () => articles.clear(),
}
