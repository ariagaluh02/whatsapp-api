require('./routes')
const { restoreSessions } = require('./sessions')
const { routes } = require('./routes')
const app = require('express')()
const bodyParser = require('body-parser')
const { maxAttachmentSize } = require('./config')

const { sendMessage } = require('./data.js')
const { AddDevice, reconnect_client } = require('./wa/wa.js');
const http = require('http');
const WebSocket = require('ws');
const { Client, LocalAuth } = require('whatsapp-web.js');
const sql = require('mssql');
const { setupSession } = require('./sessions.js')

let session = {}

// sendMessage().then((data) => {
//   console.log(data);
//     reconnect_client(session, Client, LocalAuth, system_deviceId);
// }).catch((error) => {
//   console.error(error);
// });

app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

const server = http.createServer(app);
const wsAddDevice = new WebSocket.Server({ server, path: '/add-device' });
AddDevice(wsAddDevice, Client, LocalAuth, session)

app.post('/send-message', async () => {
    const config = {
        user: 'Dev_sa',
        password: 'P3ndekarK3ra2019',
        server: '10.102.8.103\\Komix',
        database: 'WA_Broadcast',
        options: {
            trustServerCertificate: true // Add this line to disable SSL verification
          }
      };

    try {
        console.log('Getting phone numbers and messages from the database...');
        // Connect to the database
        await sql.connect(config);
        console.log('Connected to database, trying to get phone numbers and messages...');

        // Query untuk ambil no hp dan message dari db
        const result = await sql.query(`
            SELECT PHONE, MESSAGE
            FROM WEB_WHATSAPP`);

        // Close database connection
        await sql.close();
        console.log('Phone numbers and messages retrieved...');

        // Extract phone numbers and messages from the result
        const data = result.recordset;

        // Iterate through phone numbers and messages and send WhatsApp messages
        for (let i = 0; i < data.length; i++) {
          const { PHONE, MESSAGE, SENT_TIME } = data[i];
          const formattedPhoneNumber = `${PHONE}@c.us`; // Format phone number
          try {
              await client.sendMessage(formattedPhoneNumber, MESSAGE, SENT_TIME);
              console.log(`Message sent to ${formattedPhoneNumber}`);

              // Update the SENT_TIME column with the current time
              await sql.connect(config);
              await sql.query(`
                  UPDATE WEB_WHATSAPP
                  SET SENT_TIME = GETDATE() 
                  WHERE PHONE = '${PHONE}'`);
              await sql.close();
              console.log(`SENT_TIME updated for ${formattedPhoneNumber}`);
              await delay(3000);
          } catch (err) {
              console.error(`Error sending message to ${formattedPhoneNumber}:`, err);
          }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Function to create a delay using Promises
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

})

// Initialize Express app
app.disable('x-powered-by')
app.use(bodyParser.json({ limit: maxAttachmentSize + 1000000 }))
app.use(bodyParser.urlencoded({ limit: maxAttachmentSize + 1000000, extended: true }))
app.use('/', routes)

restoreSessions()

module.exports = app
