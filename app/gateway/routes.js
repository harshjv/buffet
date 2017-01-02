const url = require('url')
const mime = require('mime-types')

const router = require('express').Router()

const IPFSUtil = require('../utils/ipfs')
const RouteUtil = require('../utils/route')
const UrlUtil = require('../utils/url')

module.exports = (node) => {
  router.get('/*', (req, res) => {
    const reqPath = url.parse(req.originalUrl).pathname

    IPFSUtil.resolveMultihashForLeafNode(node, reqPath)
      .then((data) => {
        node
          .files
          .cat(data.multihash)
          .then((stream) => {
            if (reqPath[reqPath.length - 1] === '/') {
              RouteUtil.permanentRedirect(res, reqPath.substring(0, reqPath.length - 1))
            } else {
              const mimeType = mime.lookup(reqPath)

              if (mimeType) {
                res.set('Content-Type', mime.contentType(mimeType))
              }

              stream.pipe(res)
            }
          })
          .catch((e) => {
            if (e.toString() === 'Error: This dag node is a directory') {
              IPFSUtil
                .checkForDir(node, reqPath, data.multihash)
                .then((data) => {
                  if (typeof data === 'string') {
                    if (reqPath[reqPath.length - 1] !== '/') {
                      RouteUtil.permanentRedirect(res, `${reqPath}/`)
                    } else {
                      res.send(data)
                    }
                  } else {
                    RouteUtil.permanentRedirect(res, UrlUtil.joinURLParts(reqPath, data[0].name))
                  }
                }).catch((e) => {
                  console.error(e)

                  RouteUtil.somethingWentWrong(res)
                })
            } else {
              console.error(e)

              RouteUtil.somethingWentWrong(res)
            }
          })
      }).catch((e) => {
        const errorToString = e.toString()
        if (errorToString === 'Error: Next file not found') {
          res.status(404).send('404 File not found')
        } else if (errorToString.indexOf('Error: multihash length inconsistent') !== -1 ||
                   errorToString === 'Error: Non-base58 character') {
          res.status(400).send('400 Invalid multihash')
        } else {
          console.error(e)

          RouteUtil.somethingWentWrong(res)
        }
      })
  })

  return router
}
