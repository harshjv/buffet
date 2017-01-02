const querystring = require('querystring')

const removeSlashes = (url) => {
  if (url[url.length - 1] === '/') url = url.substring(0, url.length - 1)
  if (url[0] === '/') url = url.substring(1)

  return url
}

const joinURLParts = (...urls) => {
  urls = urls.filter((url) => url.length > 0)
  urls = [ '' ].concat(urls.map((url) => removeSlashes(url)))

  return urls.join('/')
}

const splitPath = (path) => {
  if (path[path.length - 1] === '/') path = path.substring(0, path.length - 1)
  const decodedPath = Object.keys(querystring.parse(path))[0]
  return decodedPath.substring(6).split('/')
}

module.exports = {
  joinURLParts,
  splitPath
}
