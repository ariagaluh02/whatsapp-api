// const sql = require('mssql');
// const { Client, LocalAuth } = require('whatsapp-web.js');
// const { generate_new_client } = require('./wa/wa.js');

// const config = {
//     user: 'Dev_sa',
//     password: 'P3ndekarK3ra2019',
//     server: '10.102.8.103\\Komix',
//     database: 'WA_Broadcast',
//     options: {
//         trustServerCertificate: true // Add this line to disable SSL verification
//       }
//   };

// async function sendMessage() {
//     const client = new Client(clientOption)
//     // const client = generate_new_client(Client, LocalAuth, system_deviceId);
//     try {
//         console.log('Getting phone numbers and messages from the database...');
//         // Connect to the database
//         await sql.connect(config);
//         console.log('Connected to database, trying to get phone numbers and messages...');

//         // Query untuk ambil no hp dan message dari db
//         const result = await sql.query(`
//             SELECT PHONE, MESSAGE
//             FROM WEB_WHATSAPP`);

//         // Close database connection
//         await sql.close();
//         console.log('Phone numbers and messages retrieved...');

//         // Extract phone numbers and messages from the result
//         const data = result.recordset;

//         // Iterate through phone numbers and messages and send WhatsApp messages
//         for (let i = 0; i < data.length; i++) {
//           const { PHONE, MESSAGE, SENT_TIME } = data[i];
//           const formattedPhoneNumber = `${PHONE}@c.us`; // Format phone number
//           try {
//               await client.sendMessage(formattedPhoneNumber, MESSAGE, SENT_TIME);
//               console.log(`Message sent to ${formattedPhoneNumber}`);

//               // Update the SENT_TIME column with the current time
//               await sql.connect(config);
//               await sql.query(`
//                   UPDATE WEB_WHATSAPP
//                   SET SENT_TIME = GETDATE() 
//                   WHERE PHONE = '${PHONE}'`);
//               await sql.close();
//               console.log(`SENT_TIME updated for ${formattedPhoneNumber}`);
//               await delay(3000);
//           } catch (err) {
//               console.error(`Error sending message to ${formattedPhoneNumber}:`, err);
//           }
//         }
//     } catch (error) {
//         console.error('Error:', error.message);
//     }
    
//     // const device_session = res.rows.map((item) => {
//     //     const acc = item.account_name;
//     //     const identity = item.identity
//     //     return `${acc}-${identity}`;
//     // });

//     return device_session;
// }

// module.exports = {sendMessage};