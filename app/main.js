const fs = require('fs')
const path = require('path')
const EventEmitter = require('events')

const emitter = new EventEmitter()

const { app, BrowserWindow, Tray, Menu, dialog, shell, clipboard } = require('electron')

const pkg = require('./package.json')
const bootstrap = require('./bootstrap')

const GATEWAY_PORT = 3000
const PLATFORM = process.platform

const trackedFilesHash = {}
const trackedFiles = []

const addFile = (cb) => {
  const files = dialog.showOpenDialog({ properties: [ 'openFile' ] })

  if (files) {
    const file = files[0]

    cb(null, file)
  } else {
    cb('No file selected')
  }

  // updateNotification.onclick = () => shell.openExternal(`${pkg.repository}/releases/latest`)
}

const createMenuFromData = ({ index, name, hash, rootHash, url, rootUrl }) => {
  return {
    label: `${name} (${hash})`,
    submenu: [
      {
        label: `Open in browser...`,
        click () { shell.openExternal(url) }
      },
      {
        label: `Open root directory in browser...`,
        click () { shell.openExternal(rootUrl) }
      },
      {
        type: 'separator'
      },
      {
        label: `Copy multihash to clipboard`,
        click () {
          emitter.emit('notify', {
            title: `Multihash of ${name} has been copied to clipboard`,
            body: hash
          })

          clipboard.writeText(hash)
        }
      },
      {
        label: `Copy multihash of root directory to clipboard`,
        click () {
          emitter.emit('notify', {
            title: `Multihash of root directory of ${name} has been copied to clipboard`,
            body: rootHash
          })

          clipboard.writeText(rootHash)
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Remove from list...',
        click () {
          dialog.showMessageBox({
            type: 'question',
            message: `Do you want to remove ${name} from the list?`,
            detail: `Even after you remove ${name} from the list, ${name} will be still available via it's multihash ${hash}`,
            buttons: [ 'Cancel', 'Yes' ]
          }, (data) => {
            if (data === 1) {
              emitter.emit('notify', {
                title: `${name} has been removed from list`,
                body: `${name} will be still available via it's multihash`
              })

              removeTrackedFile(index)
            }
          })
        }
      }
    ]
  }
}

const buildMenu = () => {
  let filesMenu

  if (trackedFiles.length === 0) {
    filesMenu = { label: 'No tracked files' }
  } else {
    filesMenu = {
      label: 'Tracked Files',
      submenu: trackedFiles.map((trackedFile) => createMenuFromData(trackedFile))
    }
  }

  return Menu.buildFromTemplate([
    {
      label: PLATFORM === 'darwin' ? `About ${app.getName()}` : 'About',
      click () { shell.openExternal(pkg.homepage) }
    },
    { type: 'separator' },
    filesMenu,
    { type: 'separator' },
    {
      label: 'Add file',
      click () {
        addFile((err, file) => {
          if (err) return

          emitter.emit('file', file)
        })
      }
    },
    { type: 'separator' },
    { role: 'quit' }
  ])
}

const handleNewFile = (data) => {
  if (!trackedFilesHash[data.hash]) {
    trackedFiles.push(data)
    trackedFilesHash[data.hash] = true
    emitter.emit('update-menu')
    emitter.emit('notify', {
      title: `${data.name} has been added to IPFS`,
      body: 'Click to open it in browser',
      url: data.url
    })
  }
}

const removeTrackedFile = (index) => {
  const data = trackedFiles[index]

  if (data) {
    trackedFiles.splice(index, 1)
    delete trackedFilesHash[data.hash]
    emitter.emit('update-menu')
  }
}

app.on('ready', () => {
  let win = new BrowserWindow({
    show: false
  })

  win.loadURL(`file://${path.join(__dirname, 'notification.html')}`)

  win.webContents.on('dom-ready', () => {
    emitter.on('notify', (data) => win.webContents.send('notification', data))
  })

  if (PLATFORM === 'darwin') app.dock.hide()

  let tray = new Tray(path.join(__dirname, 'icon.png'))

  tray.setToolTip('Buffet')
  tray.setContextMenu(buildMenu())

  emitter.on('update-menu', () => tray.setContextMenu(buildMenu()))

  bootstrap({
    gatewayPort: GATEWAY_PORT
  }, (err, data) => {
    if (err) throw err

    const { node, server } = data

    emitter.on('file', (file) => {
      // append fake_dir to preserve file name
      const fileName = path.basename(file)
      node.files.add([
        {
          path: `/fake_dir/${fileName}`,
          content: fs.createReadStream(file)
        }
      ], (err, data) => {
        if (err) throw err

        const urlArray = [ `http://localhost:${GATEWAY_PORT}`, 'ipfs', data[0].hash, '' ]
        const rootUrl = urlArray.join('/')

        urlArray.pop()
        urlArray.push(fileName)

        const url = urlArray.join('/')

        handleNewFile({
          index: trackedFiles.length,
          name: fileName,
          hash: data[1].hash,
          rootHash: data[0].hash,
          url,
          rootUrl
        })
      })
    })

    app.on('will-quit', () => {
      win = null

      server.close(() => {
        console.log('Closed server')

        node.goOffline((err) => {
          if (err) throw err

          console.log('Closed node')
        })
      })
    })
  })
})
