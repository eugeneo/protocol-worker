import {
    Worker, isMainThread, parentPort, MessagePort,
} from 'worker_threads';
import { Session } from 'inspector';

import WebSocket from 'ws';
import { URL } from 'url';

function awaitForMessage(
    target: Worker | MessagePort | null,
) {
    if (target === null) {
        return Promise.reject(new Error('Target is null'));
    }
    return new Promise((resolve) => {
        target.once('message', resolve);
    });
}

async function postMessageToSession(data: string, session: Session) {
    const { id, method, params } = JSON.parse(data);
    console.log('Received message', id, method, params);
    const message = await new Promise(
        (resolve) => session.post(method, params, (error, result) => {
            console.log('Message sent', error, result);
            if (error) {
                console.error(error);
                resolve({ id, error });
            } else {
                resolve({ id, result });
            }
        }),
    );
    console.log('Message being sent back', message);
    return JSON.stringify(message);
}

async function connectToServer(url: URL, session: Session) {
    const ws = new WebSocket(url.href);
    ws.on('open', () => {
        console.log('Connected to server');
    });
    ws.on('message', async (data: string) => {
        const response = await postMessageToSession(data, session);
        ws.send(response);
    });
    ws.on('close', () => {
        console.log('Disconnected from server');
        session.disconnect();
    });
    ws.on('error', (error: Error) => {
        console.error(error);
    });
    session.on('inspectorNotification', (data: string) => {
        console.error('Inspector notification', data);
        ws.send(data);
    });
}

async function main() {
    console.log('I am a main thread');
    const worker = new Worker(__filename);
    console.log('Let us see if worker reponds');

    const message = await awaitForMessage(worker);
    console.log('Worker talked, said', message);
    worker.postMessage({ workerAlive: true });
    const a = () => {
        console.log('I am a function');
        setTimeout(a, 1000);
    };
    a();
}

async function workerMain() {
    console.log('Worker started');
    parentPort?.postMessage({ workerAlive: true });

    const parentMessage = await awaitForMessage(parentPort);

    console.log('Parent said', parentMessage);

    const session = new Session();
    (session as any).connectToMainThread();

    await connectToServer(new URL('ws://localhost:3000/client'), session);
}

if (isMainThread) {
    main();
} else {
    workerMain();
}
