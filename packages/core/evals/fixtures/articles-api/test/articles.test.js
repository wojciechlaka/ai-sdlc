const test = require('node:test')
const assert = require('node:assert')
const store = require('../src/store/articleStore')
const articleService = require('../src/services/articleService')

test.beforeEach(() => store.clear())

test('creates and reads an article', () => {
  const created = articleService.createArticle({ title: 'Hallo Welt', body: 'Text', author: 'ana' })
  assert.strictEqual(created.slug, 'hallo-welt')
  assert.strictEqual(articleService.getArticle('hallo-welt').title, 'Hallo Welt')
})

test('lists the newest article first', () => {
  articleService.createArticle({ title: 'Erster', body: 'a', author: 'ana' })
  articleService.createArticle({ title: 'Zweiter', body: 'b', author: 'ben' })
  assert.strictEqual(articleService.listArticles().length, 2)
})

test('rejects an article without body', () => {
  assert.throws(() => articleService.createArticle({ title: 'Leer', author: 'ana' }), /erforderlich/)
})
