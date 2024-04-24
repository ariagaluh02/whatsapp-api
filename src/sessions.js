const { Client, LocalAuth } = require('whatsapp-web.js')
const fs = require('fs')
const path = require('path')
const sessions = new Map()
const { baseWebhookURL, sessionFolderPath, maxAttachmentSize, setMessagesAsSeen, webVersion, webVersionCacheType, recoverSessions } = require('./config')
const { triggerWebhook, waitForNestedObject, checkIfEventisEnabled } = require('./utils')
const sql = require('mssql');
const { sendMessage } = require('./data.js')

// Function to validate if the session is ready
const validateSession = async (sessionId) => {
  try {
    const returnData = { success: false, state: null, message: '' }

    // Session not Connected 😢
    if (!sessions.has(sessionId) || !sessions.get(sessionId)) {
      returnData.message = 'session_not_found'
      return returnData
    }

    const client = sessions.get(sessionId)
    // wait until the client is created
    await waitForNestedObject(client, 'pupPage')
      .catch((err) => { return { success: false, state: null, message: err.message } })

    // Wait for client.pupPage to be evaluable
    while (true) {
      try {
        if (client.pupPage.isClosed()) {
          return { success: false, state: null, message: 'browser tab closed' }
        }
        await client.pupPage.evaluate('1'); break
      } catch (error) {
        // Ignore error and wait for a bit before trying again
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    const state = await client.getState()
    returnData.state = state
    if (state !== 'CONNECTED') {
      returnData.message = 'session_not_connected'
      return returnData
    }

    // Session Connected 🎉
    returnData.success = true
    returnData.message = 'session_connected'
    return returnData
  } catch (error) {
    console.log(error)
    return { success: false, state: null, message: error.message }
  }
}

// Function to handle client session restoration
const restoreSessions = () => {
  try {
    if (!fs.existsSync(sessionFolderPath)) {
      fs.mkdirSync(sessionFolderPath) // Create the session directory if it doesn't exist
    }
    // Read the contents of the folder
    fs.readdir(sessionFolderPath, (_, files) => {
      // Iterate through the files in the parent folder
      for (const file of files) {
        // Use regular expression to extract the string from the folder name
        const match = file.match(/^session-(.+)$/)
        if (match) {
          const sessionId = match[1]
          console.log('existing session detected', sessionId)
          setupSession(sessionId)
        }
      }
    })
  } catch (error) {
    console.log(error)
    console.error('Failed to restore sessions:', error)
  }
}

// Setup Session
const setupSession = (sessionId) => {
  try {
    if (sessions.has(sessionId)) {
      return { success: false, message: `Session already exists for: ${sessionId}`, client: sessions.get(sessionId) }
    }

    // Disable the delete folder from the logout function (will be handled separately)
    const localAuth = new LocalAuth({ clientId: sessionId, dataPath: sessionFolderPath })
    delete localAuth.logout
    localAuth.logout = () => { }

    const clientOptions = {
      puppeteer: {
        executablePath: process.env.CHROME_BIN || null,
        // headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
      authStrategy: localAuth
    }

    if (webVersion) {
      clientOptions.webVersion = webVersion
      switch (webVersionCacheType.toLowerCase()) {
        case 'local':
          clientOptions.webVersionCache = {
            type: 'local'
          }
          break
        case 'remote':
          clientOptions.webVersionCache = {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/' + webVersion + '.html'
          }
          break
        default:
          clientOptions.webVersionCache = {
            type: 'none'
          }
      }
    }

    const client = new Client(clientOptions)

    client.initialize().catch(err => console.log('Initialize error:', err.message))

    initializeEvents(client, sessionId)

    // Save the session to the Map
    sessions.set(sessionId, client)
    return { success: true, message: 'Session initiated successfully', client }
  } catch (error) {
    return { success: false, message: error.message, client: null }
  }
}

const initializeEvents = (client, sessionId) => {
  // check if the session webhook is overridden
  const sessionWebhook = process.env[sessionId.toUpperCase() + '_WEBHOOK_URL'] || baseWebhookURL

  if (recoverSessions) {
    waitForNestedObject(client, 'pupPage').then(() => {
      const restartSession = async (sessionId) => {
        sessions.delete(sessionId)
        await client.destroy().catch(e => { })
        setupSession(sessionId)
      }
      client.pupPage.once('close', function () {
        // emitted when the page closes
        console.log(`Browser page closed for ${sessionId}. Restoring`)
        restartSession(sessionId)
      })
      client.pupPage.once('error', function () {
        // emitted when the page crashes
        console.log(`Error occurred on browser page for ${sessionId}. Restoring`)
        restartSession(sessionId)
      })
    }).catch(e => { })
  }

  checkIfEventisEnabled('auth_failure')
    .then(_ => {
      client.on('auth_failure', (msg) => {
        triggerWebhook(sessionWebhook, sessionId, 'status', { msg })
      })
    })

  checkIfEventisEnabled('authenticated')
    .then(_ => {
      client.on('authenticated', () => {
        triggerWebhook(sessionWebhook, sessionId, 'authenticated')
      })
    })

  checkIfEventisEnabled('call')
    .then(_ => {
      client.on('call', async (call) => {
        triggerWebhook(sessionWebhook, sessionId, 'call', { call })
      })
    })

  checkIfEventisEnabled('change_state')
    .then(_ => {
      client.on('change_state', state => {
        triggerWebhook(sessionWebhook, sessionId, 'change_state', { state })
      })
    })

  checkIfEventisEnabled('disconnected')
    .then(_ => {
      client.on('disconnected', (reason) => {
        triggerWebhook(sessionWebhook, sessionId, 'disconnected', { reason })
      })
    })

  checkIfEventisEnabled('group_join')
    .then(_ => {
      client.on('group_join', (notification) => {
        triggerWebhook(sessionWebhook, sessionId, 'group_join', { notification })
      })
    })

  checkIfEventisEnabled('group_leave')
    .then(_ => {
      client.on('group_leave', (notification) => {
        triggerWebhook(sessionWebhook, sessionId, 'group_leave', { notification })
      })
    })

  checkIfEventisEnabled('group_update')
    .then(_ => {
      client.on('group_update', (notification) => {
        triggerWebhook(sessionWebhook, sessionId, 'group_update', { notification })
      })
    })

  checkIfEventisEnabled('loading_screen')
    .then(_ => {
      client.on('loading_screen', (percent, message) => {
        triggerWebhook(sessionWebhook, sessionId, 'loading_screen', { percent, message })
      })
    })

  checkIfEventisEnabled('media_uploaded')
    .then(_ => {
      client.on('media_uploaded', (message) => {
        triggerWebhook(sessionWebhook, sessionId, 'media_uploaded', { message })
      })
    })

  checkIfEventisEnabled('message')
    .then(_ => {
      client.on('message', async (message) => {
        triggerWebhook(sessionWebhook, sessionId, 'message', { message })
        if (message.hasMedia && message._data?.size < maxAttachmentSize) {
          // custom service event
          checkIfEventisEnabled('media').then(_ => {
            message.downloadMedia().then(messageMedia => {
              triggerWebhook(sessionWebhook, sessionId, 'media', { messageMedia, message })
            }).catch(e => {
              console.log('Download media error:', e.message)
            })
          })
        }
        if (setMessagesAsSeen) {
          const chat = await message.getChat()
          chat.sendSeen()
        }
      })
    })

  checkIfEventisEnabled('message_ack')
    .then(_ => {
      client.on('message_ack', async (message, ack) => {
        triggerWebhook(sessionWebhook, sessionId, 'message_ack', { message, ack })
        if (setMessagesAsSeen) {
          const chat = await message.getChat()
          chat.sendSeen()
        }
      })
    })

  checkIfEventisEnabled('message_create')
    .then(_ => {
      client.on('message_create', async (message) => {
        triggerWebhook(sessionWebhook, sessionId, 'message_create', { message })
        if (setMessagesAsSeen) {
          const chat = await message.getChat()
          chat.sendSeen()
        }
      })
    })

  checkIfEventisEnabled('message_reaction')
    .then(_ => {
      client.on('message_reaction', (reaction) => {
        triggerWebhook(sessionWebhook, sessionId, 'message_reaction', { reaction })
      })
    })

  checkIfEventisEnabled('message_revoke_everyone')
    .then(_ => {
      client.on('message_revoke_everyone', async (after, before) => {
        triggerWebhook(sessionWebhook, sessionId, 'message_revoke_everyone', { after, before })
      })
    })

  client.on('qr', (qr) => {
    // inject qr code into session
    client.qr = qr
    checkIfEventisEnabled('qr')
      .then(_ => {
        triggerWebhook(sessionWebhook, sessionId, 'qr', { qr })
      })
  })

  const config = {
    user: 'Dev_sa',
    password: 'P3ndekarK3ra2019',
    server: '10.102.8.103\\Komix',
    database: 'WA_Broadcast',
    options: {
        trustServerCertificate: true // Add this line to disable SSL verification
      }
  };

  checkIfEventisEnabled('ready')
    .then(_ => {
      client.on('ready', async () => {
        triggerWebhook(sessionWebhook, sessionId, 'ready')
        // CustomFunction untuk mengirim pesan otomatis ke wa yang tercantum di db

        // Function to periodically check for new messages in the database and send them
        async function sendMessages() {
          try {
            const currentTime = new Date().toLocaleString();
            // console.log(`(${currentTime}) - Getting phone numbers and messages from the database...`);
            // Connect to the database
            await sql.connect(config);
            console.log(`(${currentTime}) - Connected to database ...`);

            // Query ambil phone number dan messages dari db
            const result = await sql.query(`
                SELECT TOP (1) *
                FROM WEB_WHATSAPP
                WHERE 1=1 
                and STATUS = 'NEW'
                and SENT_TIME is Null or SENT_TIME = ''
                ORDER BY MSG_TIME asc`);
              // SELECT PHONE, MESSAGE, SENT_TIME, STATUS
              // FROM WEB_WHATSAPP
              // WHERE STATUS = 'NEW' AND (SENT_TIME IS NULL OR SENT_TIME = '')`);

            // Close database connection
            await sql.close();
            console.log(`(${currentTime}) - Retrieving phone number and message ...`);
            // console.log(`(${currentTime}) - Retrieving phone number with STATUS = "NEW"`);

            // Extract phone numbers, messages, dan status dari result
            const data = result.recordset;

            // Logs no phone number
            if (data.length === 0) {
                const currentTime = new Date().toLocaleString();
                console.log(`(${currentTime}) - No phone number with STATUS = "NEW"`);
                console.log(`---------------------------------------------------------------------------`);
            } 

            // Perulangan untuk mengirim pesan Whatsapp
            for (let i = 0; i < data.length; i++) {
              const { PHONE, MESSAGE, SENT_TIME, STATUS } = data[i];
              // const formattedPhoneNumber = `${PHONE}@c.us`; // Format phone number
              let formattedPhoneNumber = `${PHONE}`; // Format phone number

              // Preprocess phone number to ensure consistent format
              if (PHONE.startsWith('+62')) {
                  // If phone number starts with '+62', remove the '+' sign
                  formattedPhoneNumber = PHONE.substring(1);
              } else if (PHONE.startsWith('08')) {
                  // If phone number starts with '08', prepend '62' to convert it to international format
                  formattedPhoneNumber = `62${PHONE.substring(1)}`;
              }

              if (formattedPhoneNumber !== PHONE) {
                try {
                  await sql.connect(config);
                  await sql.query(`
                      UPDATE WEB_WHATSAPP
                      SET PHONE = '${formattedPhoneNumber}'
                      WHERE PHONE = '${PHONE}'`);
                  await sql.close();
                  console.log(`(${currentTime}) - Phone number updated to ${formattedPhoneNumber}`);
                  console.log(`---------------------------------------------------------------------------`);
                  break;
                } catch (err) {
                  console.error(`(${currentTime}) - Error updating phone number in the database:`, err);
                  console.log(`---------------------------------------------------------------------------`);
                }
              }

              // Format the phone number with '@c.us' for WhatsApp API
              formattedPhoneNumber = `${formattedPhoneNumber}@c.us`;
        
              try {
                // If SENT_TIME is null or empty, set it to current time
                const sentTime = SENT_TIME ? SENT_TIME : new Date();
                const currentTime = new Date().toLocaleString();
                await client.sendMessage(formattedPhoneNumber, MESSAGE, sentTime, STATUS);
                console.log(`(${currentTime}) - Message sent to ${formattedPhoneNumber}`);

                // Update SENT_TIME column with the current time and STATUS to "SENT"
                await sql.connect(config);
                await sql.query(`
                  UPDATE WEB_WHATSAPP
                  SET SENT_TIME = GETDATE(),
                      STATUS = 'SENT',
                      FLAG = '1',
                      DESCRIPTION = 'Message sent successfully'
                  WHERE PHONE = '${PHONE}'`);
                await sql.close();
                console.log(`(${currentTime}) - data for ${formattedPhoneNumber} has been updated!`);
                console.log(`---------------------------------------------------------------------------`);
                await delay(3000); // Add a delay before sending the next message
              } catch (err) {
                console.error(`(${currentTime}) - Error sending message to ${formattedPhoneNumber}:`, err);

                const errorMessage = err.message;

                try {
                  await sql.connect(config);
                  await sql.query(`
                      UPDATE WEB_WHATSAPP
                      SET DESCRIPTION = '${errorMessage}'
                      WHERE PHONE = '${PHONE}'`);
                  await sql.close();
                  console.log(`DESCRIPTION updated for ${formattedPhoneNumber}`);
                } catch (error) {
                    console.error(`Error updating DESCRIPTION for ${formattedPhoneNumber}:`, error);
                }

              }
            }
          } catch (error) {
            console.error('Error:', error.message);
          }
        }

        // Function to periodically check for new data and send messages
        const dataInterval = setInterval(sendMessages, 4 * 1000); // Every 4 sec
        sendMessages();
      })
    })
 // Enseval123!
  // Function to create a delay using Promises
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  

  checkIfEventisEnabled('contact_changed')
    .then(_ => {
      client.on('contact_changed', async (message, oldId, newId, isContact) => {
        triggerWebhook(sessionWebhook, sessionId, 'contact_changed', { message, oldId, newId, isContact })
      })
    })
}

const deleteSessionFolder = async (sessionId) => {
  try {
    const targetDirPath = path.join(sessionFolderPath, `session-${sessionId}`)
    const resolvedTargetDirPath = await fs.promises.realpath(targetDirPath)
    const resolvedSessionPath = await fs.promises.realpath(sessionFolderPath)

    // Ensure the target directory path ends with a path separator
    const safeSessionPath = `${resolvedSessionPath}${path.sep}`

    // Validate the resolved target directory path is a subdirectory of the session folder path
    if (!resolvedTargetDirPath.startsWith(safeSessionPath)) {
      throw new Error('Invalid path: Directory traversal detected')
    }
    await fs.promises.rm(resolvedTargetDirPath, { recursive: true, force: true })
  } catch (error) {
    console.log('Folder deletion error', error)
    throw error
  }
}

// Function to delete client session
const deleteSession = async (sessionId, validation) => {
  try {
    const client = sessions.get(sessionId)
    if (!client) {
      return
    }
    client.pupPage.removeAllListeners('close')
    client.pupPage.removeAllListeners('error')
    if (validation.success) {
      // Client Connected, request logout
      console.log(`Logging out session ${sessionId}`)
      await client.logout()
    } else if (validation.message === 'session_not_connected') {
      // Client not Connected, request destroy
      console.log(`Destroying session ${sessionId}`)
      await client.destroy()
    }

    // Wait for client.pupBrowser to be disconnected before deleting the folder
    while (client.pupBrowser.isConnected()) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await deleteSessionFolder(sessionId)
    sessions.delete(sessionId)
  } catch (error) {
    console.log(error)
    throw error
  }
}

// Function to handle session flush
const flushSessions = async (deleteOnlyInactive) => {
  try {
    // Read the contents of the sessions folder
    const files = await fs.promises.readdir(sessionFolderPath)
    // Iterate through the files in the parent folder
    for (const file of files) {
      // Use regular expression to extract the string from the folder name
      const match = file.match(/^session-(.+)$/)
      if (match) {
        const sessionId = match[1]
        const validation = await validateSession(sessionId)
        if (!deleteOnlyInactive || !validation.success) {
          await deleteSession(sessionId, validation)
        }
      }
    }
  } catch (error) {
    console.log(error)
    throw error
  }
}

module.exports = {
  sessions,
  setupSession,
  sendMessage,
  restoreSessions,
  validateSession,
  deleteSession,
  flushSessions
}
