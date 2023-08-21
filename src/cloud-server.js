const path = require('path')

const { readFile, writeFile } = require('./util.js')

const validProjectId = /^\w+$/

class Client {
  variables = {}

  constructor() {
    this.saveTimeout = null
    this.savePath = null
  }

  save () {
    if (this.saveTimeout) return
    this.saveTimeout = setTimeout(() => {
      writeFile(this.savePath, JSON.stringify(this.variables))
      this.saveTimeout = null
    }, 1000)
  }

  async setUsername (server, client, username) {
    this.savePath = `cloud-vars/${username}.json`
    this.variables = JSON.parse(await readFile(this.savePath).catch(() => '{}'))
    const changes = Object.entries(this.variables).map(([name, value]) => ({
      method: 'set',
      name: name,
      value
    }))
    server.reply(client, changes)
  }
}

class ProjectData {
  clients = new Map()
}

class CloudServer {
  constructor ({ lockVars = false } = {}) {
    this.projects = new Map()
    this.lockVars = lockVars

    this.handleWsConnection = this.handleWsConnection.bind(this)
  }

  async getProject (id) {
    const project = this.projects.get(id)
    if (project) return project

    if (!validProjectId.test(id)) return null

    const projectData = new ProjectData()
    this.projects.set(id, projectData)
    return projectData
  }

  reply (ws, messages) {
    ws.send(messages.map(message => JSON.stringify(message) + '\n').join(''))
  }

  handleWsConnection (ws) {
    let handshaken = false
    let project = null

    ws.on('message', async data => {
      let message
      try {
        message = JSON.parse(data)
      } catch (err) {
        console.error('I received invalid JSON over the Websocket connection.')
        console.error(data)
        console.error(err)
        console.error('This might mean that someone is trying to tamper with your server.')
        return
      }
      switch (message.method) {
        case 'handshake':
          if (!handshaken) {
            handshaken = true
            this.getProject(message.project_id).then(projectData => {
              if (projectData) {
                project = projectData
                project.clients.set(ws, new Client(this))
              }
            })
          }
          break
        case 'create':
        case 'set':
          if (project) {
            const client = project.clients.get(ws)

            if (message.name == '\u2601 _username') {
              await client.setUsername(this, ws, message.value)
            }
              
            client.variables[message.name] = message.value
            client.save()
          }
          break
        default:
          console.error(`I received an unknown method ${message.method}.`)
      }
    })

    ws.on('error', console.error)

    ws.on('close', () => {
      if (project) {
        project.clients.delete(ws)
      }
    })
  }
}

module.exports = CloudServer
