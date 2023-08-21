const path = require('path')

const { readFile, writeFile } = require('./util.js')

const validProjectId = /^\w+$/

class ProjectData {
  connections = new Set()
  variables = {}

  constructor(server) {
    this.saveTimeout = null
    this.savePath = null
    this.server = server
  }

  save () {
    if (this.saveTimeout) return
    this.saveTimeout = setTimeout(() => {
      writeFile(this.savePath, JSON.stringify(this.variables))
      this.saveTimeout = null
    }, 1000)
  }

  announce (announcer, messages) {
    for (const connection of this.connections) {
      if (connection !== announcer) {
        this.server.reply(connection, messages)
      }
    }
  }

  async setUsername (client, username) {
    this.savePath = `cloud-vars/${username}.json`
    this.variables = JSON.parse(await readFile(this.savePath).catch(() => '{}'))
    const changes = Object.entries(this.variables).map(([name, value]) => ({
      method: 'set',
      name: name,
      value
    }))
    this.server.reply(client, changes)
  }
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

    const projectData = new ProjectData(this)
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
                project.connections.add(ws)
              }
            })
          }
          break
        case 'create':
        case 'set':
          if (project) {
            if (message.name == '\u2601 _username') {
              await project.setUsername(ws, message.value)
              project.variables[message.name] = message.value
            } else {
              project.variables[message.name] = message.value
              project.announce(ws, [{
                method: 'set',
                name: message.name,
                value: message.value
              }])
            }
            project.save()
          }
          break
        case 'rename':
          if (project && !this.lockVars) {
            project.variables[message.new_name] = project.variables[message.name]
            delete project[message.name]
            project.announce(ws, [{
              method: 'set',
              name: message.new_name,
              value: message.value
            }])
            project.save()
          }
          break
        case 'delete':
          if (project && !this.lockVars) {
            delete project.variables[message.name]
            project.save()
          }
          break
        default:
          console.error(`I received an unknown method ${message.method}.`)
      }
    })

    ws.on('error', console.error)

    ws.on('close', () => {
      if (project) {
        project.connections.delete(ws)
      }
    })
  }
}

module.exports = CloudServer
