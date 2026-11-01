const express = require('express')
const articlesRouter = require('./routes/articles')

const app = express()
app.use(express.json())
app.use('/api/articles', articlesRouter)

app.use((err, req, res, next) => {
  const status = err.status || 500
  res.status(status).json({ error: err.message })
})

if (require.main === module) {
  app.listen(process.env.PORT || 3000)
}

module.exports = app
