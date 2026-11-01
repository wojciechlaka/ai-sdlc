const express = require('express')
const articleService = require('../services/articleService')

const router = express.Router()

router.get('/', (req, res) => {
  res.json({ articles: articleService.listArticles() })
})

router.get('/:slug', (req, res, next) => {
  try {
    res.json({ article: articleService.getArticle(req.params.slug) })
  } catch (err) {
    next(err)
  }
})

router.post('/', (req, res, next) => {
  try {
    res.status(201).json({ article: articleService.createArticle(req.body) })
  } catch (err) {
    next(err)
  }
})

router.delete('/:slug', (req, res, next) => {
  try {
    articleService.deleteArticle(req.params.slug)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

module.exports = router
