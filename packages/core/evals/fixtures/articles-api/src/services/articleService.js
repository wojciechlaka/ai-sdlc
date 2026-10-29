const store = require('../store/articleStore')

class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.status = 404
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.status = 422
  }
}

function slugify(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Shape of an article in API responses. */
function toResponse(article) {
  return {
    slug: article.slug,
    title: article.title,
    body: article.body,
    author: article.author,
    createdAt: article.createdAt.toISOString(),
  }
}

function listArticles() {
  return store.all()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toResponse)
}

function getArticle(slug) {
  const article = store.find(slug)
  if (!article) {
    throw new NotFoundError(`Artikel ${slug} nicht gefunden`)
  }
  return toResponse(article)
}

function createArticle(input) {
  if (!input || !input.title || !input.body || !input.author) {
    throw new ValidationError('title, body und author sind erforderlich')
  }
  const article = { slug: slugify(input.title), title: input.title, body: input.body, author: input.author, createdAt: new Date() }
  store.save(article)
  return toResponse(article)
}

function deleteArticle(slug) {
  if (!store.remove(slug)) {
    throw new NotFoundError(`Artikel ${slug} nicht gefunden`)
  }
}

module.exports = { listArticles, getArticle, createArticle, deleteArticle, NotFoundError, ValidationError }
