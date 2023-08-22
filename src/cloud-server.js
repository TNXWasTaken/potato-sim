const { readFile, writeFile } = require('./util.js')

class Client
{
  constructor()
  {
    this.savePath = null
    this.variables = {}
  }

  save()
  {
    try
    {
      writeFile (this.savePath, JSON.stringify (this.variables))
    }
    catch (err)
    {
      console.error (`Unable to save to "${this.savePath}"`)
      console.error (err)
    }
  }

  setVariable (name, value)
  {
    this.variables[name] = value
  }

  async setUsername (server, connection, username)
  {
    this.savePath = `cloud-vars/${username}.json`
    this.variables = JSON.parse (await readFile (this.savePath).catch(() => '{}'))
    const changes = Object.entries (this.variables).map (([name, value]) =>
    ({
      method: 'set',
      name: name,
      value
    }))
    connection.send (changes.map (change => JSON.stringify (message) + '\n').join(''))
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
    const client = new Client()

    ws.on ('message', async data =>
    {
      let message

      try
      {
        message = JSON.parse (data)
      }
      catch (err)
      {
        console.error ('I received invalid JSON over the Websocket connection.')
        console.error (data)
        console.error (err)
        console.error ('This might mean that someone is trying to tamper with your server.')
        return
      }

      switch (message.method)
      {
        case 'handshake':
          break
        case 'create':
        case 'set':
          if (message.name == '\u2601 _username')
            await client.setUsername (this, ws, message.value)
          else
            client.setVariable (message.name, message.value)
          break
        default:
          console.error (`I received an unknown method ${message.method}.`)
      }
    })

    ws.on ('error', console.error)
    ws.on ('close', () => { client.save() })
  }
}

module.exports = CloudServer
