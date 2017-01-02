const somethingWentWrong = (res) => res.status(500).send('500 Something went wrong')
const permanentRedirect = (res, path) => res.status(301).redirect(path)

module.exports = {
  somethingWentWrong,
  permanentRedirect
}
