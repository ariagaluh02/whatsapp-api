function generate_new_client(Client, LocalAuth, system_deviceId) {
    console.log('session not opened, trying to get new')
    console.log(Client, LocalAuth, system_deviceId)
    const client = new Client({
        puppeteer: {
            headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--single-process', // <- this one doesn't works in Windows 
                '--disable-gpu',],
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
          },
        authStrategy: new LocalAuth({ clientId: system_deviceId })
    });
    client.initialize();
    return client
}

function reconnect_client(session, Client, LocalAuth, system_deviceId) {
    console.log(`'connecting device: ${system_deviceId}'`);
    client = generate_new_client(Client, LocalAuth, system_deviceId);

    client.on('ready', () => {
        console.log('client ', system_deviceId, ' is ready !');

        // Number where you want to send the message.
        const number = "+6281546544953";

        // Your message.
        const text = "Hey Aria";

        // Getting chatId from the number.
        // we have to delete "+" from the beginning and add "@c.us" at the end of the number.
        const chatId = number.substring(1) + "@c.us";

        // Sending message.
        client.sendMessage(chatId, text);

    });

    client.on('qr', (qr) => {
        console.log('QR RECEIVED for ', system_deviceId);
        console.log('QR: ', qr);
    });

    client.on('message', message => {
        if (message.body === '!ping') {
            message.reply('pong');
        }
    });

    session[system_deviceId] = client;
}

function AddDevice(wss, Client, LocalAuth, session) {
    wss.on('connection', (ws, req) => {
        console.log('Client connected!');
        // console.log(req.headers.type);
        ws.on('message', (req) => {
            // const data = req.JSON()
            const data = JSON.parse(req);
            const type = data.type;

            if (type === 'register') {
                const deviceId = data.data.deviceId;
                // const username = data.data.username;
                const system_deviceId = deviceId
                console.log(system_deviceId)
                client = session[system_deviceId]

                if (!client) {
                    console.log('client is not ready')
                    console.log(`'adding new device: ${system_deviceId}'`);
                    client = generate_new_client(Client, LocalAuth, system_deviceId);
                } else {
                    console.log('client is ready!')
                }

                // console.log(client)
                // client.getState(function(err, status) {
                //     if (err) {
                //       console.error(err);
                //     } else {
                //       const client_status = status;
                //       console.log(client_status);
                //     }
                // });

                client.on('qr', (qr) => {
                    console.log('QR RECEIVED', qr);
                    const res = {
                        type: "qr",
                        data: {
                            deviceId: deviceId,
                            qr: qr
                        }
                    }
                    ws.send(JSON.stringify(res));
                });

                client.on('authenticated', () => {
                    console.log('client authenticated!');
                    session[system_deviceId] = client
                    const res = {
                        type: "authenticated",
                        data: {
                            deviceId: deviceId,
                        }
                    }
                    ws.send(JSON.stringify(res));
                });

                client.on('ready', () => {
                    console.log('client is ready !')
                    const res = {
                        type: "ready",
                        data: {
                            deviceId: deviceId,
                        }
                    }
                    ws.send(JSON.stringify(res));
                })

                client.on('message', message => {
                    if (message.body === '!ping') {
                        message.reply('pong');
                    }
                });

            }
            // else if (type === 'message-test') {
            //     client =  session[system_deviceId]
            // }



        });

        ws.on('close', () => {
            // try {
            //     console.log('destroying client')
            //     client.destroy();

            //     console.log('reinitialize client')
            //     client.initialize();
            // }
            // catch(err) {
            //     console.log(err)
            // }
            console.log('Client has disconnected!');
        });
    })
}

module.exports = {
    reconnect_client,
    generate_new_client,
    AddDevice
};