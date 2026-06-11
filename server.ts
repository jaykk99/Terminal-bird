import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client } from 'ssh2';
import path from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});
const PORT = 3000;

app.use(express.json());

// API endpoint for UI verification feedback
app.post('/api/verify', (req, res) => {
  const { host, port, username, password } = req.body;
  
  if (!host || !username) {
    res.status(400).json({ success: false, error: 'Host and username are required' });
    return;
  }

  const conn = new Client();
  
  conn.on('ready', () => {
    conn.end();
    res.json({ success: true });
  }).on('error', (err) => {
    res.status(400).json({ success: false, error: err.message });
  }).connect({
    host,
    port: parseInt(port, 10) || 22,
    username,
    password,
    readyTimeout: 10000
  });
});

io.on('connection', (socket) => {
  let conn: Client | null = null;
  let stream: any = null;

  socket.on('init-ssh', (data) => {
    const { host, port, username, password, cols, rows } = data;
    
    conn = new Client();
    conn.on('ready', () => {
      socket.emit('ssh-ready');
      conn!.shell({ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 }, (err, s) => {
        if (err) {
          socket.emit('ssh-error', err.message);
          conn!.end();
          return;
        }
        stream = s;
        
        socket.on('ssh-data', (d) => {
          if (stream) stream.write(d);
        });

        socket.on('ssh-resize', ({ cols, rows }) => {
          if (stream) stream.setWindow(rows, cols, 0, 0);
        });

        stream.on('data', (d: any) => {
          socket.emit('ssh-data', d.toString('utf-8'));
        }).on('close', () => {
          socket.emit('ssh-close');
          conn!.end();
        });
      });
    }).on('error', (err) => {
      socket.emit('ssh-error', err.message);
    }).connect({
      host,
      port: parseInt(port, 10) || 22,
      username,
      password,
      readyTimeout: 10000
    });
  });

  socket.on('disconnect', () => {
    if (conn) {
        try {
            conn.end();
        } catch(e) {}
    }
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    // The asterisk needs to be compatible with express 4/5 depending on version
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
