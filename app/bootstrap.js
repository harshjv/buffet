const Express = require('express')

const ipfs = require('./utils/ipfs')
const routes = require('./gateway/routes')

const express = Express()

module.exports = ({ gatewayPort }, cb) => {
  ipfs.startNode((err, node) => {
    if (err) return cb(err)

    express.use('/ipfs', routes(node))

    const server = express.listen(gatewayPort, (err) => {
      if (err) return cb(err)

      process.nextTick(() => {
        cb(null, { node, server })
      })
    })
  })
}
