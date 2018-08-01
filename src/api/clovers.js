import resource from 'resource-router-middleware'
// import clovers from '../models/clovers'
import r from 'rethinkdb'
import { toRes, toSVG, toPNG } from '../lib/util'
import fs from 'fs'
import path from 'path'
import basicAuth from 'express-basic-auth'
import { auth } from '../middleware/auth'

export default ({ config, db, io}) => {
  const load = (req, id, callback) => {
    r.db('clovers_v2').table('clovers').get(id).run(db, (err, clover) => {
      clover.image = { svg: 'https://metadata.clovers.network/svg/' + id + '.svg' }
      clover.image.png = 'https://metadata.clovers.network/png/' + id + '.png'
      callback(err, clover)
    })
  }
  let router = resource({
    id : 'clover',

    load,

    index ({ query }, res) {
      const before = parseInt(query.before) || false
      r.db('clovers_v2').table('clovers')
        .orderBy(r.desc('modified'))
        .filter((row) => {
          return r.branch(
            before,
            row('modified').lt(before),
            row
          )
        }).limit(12).run(db, toRes(res))
    },


    read ({ clover }, res) {
      res.json(clover)
    }
  })

  router.get('/svg/:id/:size?', async (req, res) => {
    try {
      let id = req.params.id || res.sendStatus(404)
      let size = req.params.size || 400

      let svg = path.resolve(__dirname + '/../../public/svg/' + size + '/' + id + '.svg')
      // if (!fs.existsSync(svg)) {
        await toSVG(id, size)
      // }
      res.sendFile(id + '.svg', {root: './public/svg/' + size})
    } catch (error) {
      console.log('this error' + error)
      res.sendStatus(404).send(error)
    }
  })
  router.get('png/:id', async (req, res) => {
    let png = path.resolve(__dirname + '/../../public/png/' + id + '.png')
    try {
      if (!fs.existsSync(png)) {
        await toPNG(id)
      }
      res.sendFile(id + '.png', {root: './public/png'})
    } catch (error) {
      res.sendStatus(404).json(error)
    }
  })

  // Basic authentication
  router.use(basicAuth({
    authorizer: auth
  }))

  router.put('/:id', async (req, res) => {
    const { id } = req.params
    const { user } = req.auth
    let name = req.body.name || ''
    name = name.substring(0, 34)
    load(req, id, (err, clover) => {
      const owner = clover.owner.toLowerCase() === user.toLowerCase()
      if (err || !owner) {
        res.sendStatus(401).end()
        return
      }

      // db update
      r.db('clovers_v2').table('clovers').get(clover.board)
        .update({ name }, { returnChanges: true }).run(db, (err, { changes }) => {
          if (err) {
            res.sendStatus(500).end()
            return
          }
          if (changes[0]) {
            clover = changes[0].new_val
          }
          res.json(clover)
        })
    })
  })

  return router
}

function isOwner (wallet, record) {
  return record.owner === wallet
}
