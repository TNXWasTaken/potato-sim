const { readFile, writeFile } = require('./util.js')

function cloudVariable (name)
{
  return `\u2601 ${name}`
}

class Client
{
  constructor (connection)
  {
    this.connection = connection
    this.variables = {}
    this.savePath = null
  }

  async saveVariables()
  {
    try
    {
      writeFile (this.savePath, JSON.stringify (this.variables))
    }
    catch (err)
    {
      console.error (`Unable to save variables to "${this.savePath}"`)
      console.error (err)
    }
  }

  async setVariable (name, value)
  {
    this.variables[name] = value
  }

  async loadVariablesForUser (username, listener)
  {
    this.savePath = `cloud-vars/${username}.json`
    this.variables = JSON.parse (await readFile (this.savePath).catch(() => JSON.stringify(this.variables)))

    const changes = Object.entries (this.variables).map (([name, value]) =>
    ({
      method: 'set',
      name: name,
      value
    }))

    const message = changes.map (change => JSON.stringify (change)).join('\n')
    try
    {
      this.connection.send(`${message}\n`)
    }
    catch (err)
    {
      console.error (`Unable to send message to client: ${message}`)
      console.error (err)
    }
  }
}

class CloudServer
{
  constructor()
  {
    this.handleWsConnection = this.handleWsConnection.bind (this)
  }

  handleWsConnection (ws)
  {
    const client = new Client (ws)

    ws.on ('message', async data =>
    {
      let message

      try
      {
        message = JSON.parse (data)
      }
      catch (err)
      {
        console.error ('Received invalid JSON over the Websocket connection.')
        console.error ('This might mean that someone is trying to tamper with the server!')
        console.error (data)
        console.error (err)
        return
      }

      switch (message.method)
      {
        case 'handshake':
          break
        case 'create':
        case 'set':
          if (message.name == cloudVariable ('_username'))
            await client.loadVariablesForUser (message.value)
          else
            await client.setVariable (message.name, message.value)
          break
        case 'save':
          await client.saveVariables()
          break
        default:
          console.error (`Unknown server method ${message.method}.`)
      }
    })

    ws.on ('error', console.error)
    ws.on ('close', () => 
    { 
      client.saveVariables() 
    })
  }
}

module.exports = CloudServer
