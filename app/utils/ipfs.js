const os = require('os')
const path = require('path')

const Promise = require('bluebird')
const IPFS = require('ipfs')
const IPFSRepo = require('ipfs-repo')
const fsStore = require('fs-pull-blob-store')
const multihashes = require('multihashes')

const UrlUtil = require('./url')

const PACKAGE_NAME = require('../package.json').name
const INDEX_HTML_FILES = [ 'index.html', 'index.htm', 'index.shtml' ]
const IPFS_REPO_PATH = path.join(os.homedir(), `.${PACKAGE_NAME}`)

const promisedFor = Promise.method((condition, action, value) => {
  if (!condition(value)) return value
  return action(value).then(promisedFor.bind(null, condition, action))
})

const prepareNode = (repo, cb) => {
  const node = new IPFS(repo)

  repo.exists((err, exists) => {
    if (err) {
      cb(err)
      return
    }

    if (exists) {
      console.log('Repo exists')

      return cb(null, node)
    } else {
      console.log('Repo does not exist')

      node.init({ emptyRepo: true, bits: 2048 }, (err) => {
        if (err) return cb(err)

        return cb(null, node)
      })
    }
  })
}

const resolveMultihashForLeafNode = (node, path) => {
  const parts = UrlUtil.splitPath(path)
  const partsLength = parts.length

  return promisedFor((i) => i.index < partsLength,
                     (i) => {
                       const currentIndex = i.index
                       const currentMultihash = i.multihash

                       multihashes.validate(multihashes.fromB58String(currentMultihash))

                       return node.object.get(currentMultihash, { enc: 'base58' })
                                  .then((DAGNode) => {
                                    if (currentIndex === partsLength - 1) {
                                      return {
                                        multihash: currentMultihash,
                                        index: currentIndex + 1
                                      }
                                    } else {
                                      let multihashOfNextFile
                                      const nextFileName = parts[currentIndex + 1]
                                      const links = DAGNode.links

                                      for (let link of links) {
                                        if (link.name === nextFileName) {
                                          multihashOfNextFile = multihashes.toB58String(link.multihash)
                                          break
                                        }
                                      }

                                      if (!multihashOfNextFile) {
                                        throw new Error('Next file not found')
                                      }

                                      return {
                                        multihash: multihashOfNextFile,
                                        index: currentIndex + 1
                                      }
                                    }
                                  })
                     }, {
                       multihash: parts[0],
                       index: 0
                     })
}

const checkForDir = (node, path, multihash) => {
  return node.object.get(multihash, { enc: 'base58' })
                    .then((DAGNode) => {
                      const links = DAGNode.links

                      const indexFiles = links.filter((link) => INDEX_HTML_FILES.indexOf(link.name) !== -1)
                      if (indexFiles.length > 0) {
                        console.log('Found')
                        return indexFiles
                      }

                      const output = []
                      const parts = UrlUtil.splitPath(path)

                      if (parts.length > 1) {
                        parts.pop()

                        let parentLink = [ '', 'ipfs' ].concat(parts).join('/')
                        output.push(`<a href="${parentLink}">..</a>`)
                      }

                      const html = output.concat(links.map((link) => {
                        const multihash = multihashes.toB58String(link.multihash)
                        return `${multihash} <a href="${UrlUtil.joinURLParts(path, link.name)}">${link.name}</a>`
                      }))

                      return html.join('<br>')
                    })
}

const startNode = (cb) => {
  const repo = new IPFSRepo(IPFS_REPO_PATH, { stores: fsStore })

  prepareNode(repo, (err, node) => {
    if (err) throw err

    node.load((err) => {
      if (err) throw err

      node.goOnline((err) => {
        if (err) throw err

        cb(null, node)
      })
    })
  })
}

module.exports = {
  startNode,
  checkForDir,
  resolveMultihashForLeafNode
}
