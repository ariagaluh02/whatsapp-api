const sql = require('mssql');

const config = {
    user: 'Dev_sa',
    password: 'P3ndekarK3ra2019',
    server: '10.102.8.103\\Komix',
    database: 'WA_Broadcast',
    options: {
        trustServerCertificate: true // Add this line to disable SSL verification
      }
  };

async function sendMessage() {
    try {
        console.log('getting phone number...');
        // Connect to the database
        await sql.connect(config);
        console.log('Connected to database, trying to get phone numbers...');

        // Query to retrieve phone numbers from WEB_WHATSAPP table
        const result = await sql.query(`
            SELECT PHONE, MESSAGE
            FROM WEB_WHATSAPP`);

        // Close the connection
        await sql.close();
        console.log('Phone numbers retrieved...');

        // Extract phone numbers from the result
        const phoneNumbers = result.recordset.map(row => row.PHONE);
        return phoneNumbers;
    } catch (err) {
        console.error('Error:', err.message);
        throw err; // Throw error for handling in upper layer
    }
}

module.exports = {sendMessage};