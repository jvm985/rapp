import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

const GOOGLE_CLIENT_ID = '339058057860-i6ne31mqs27mqm2ulac7al9vi26pmgo1.apps.googleusercontent.com';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret-r-app';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/rapp';

mongoose.connect(MONGO_URI);

// Schemas
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  picture: String,
  isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

const FileSchema = new mongoose.Schema({
  name: String,
  content: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sharedWith: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    permission: { type: String, enum: ['read', 'write'] }
  }],
  lastModified: { type: Date, default: Date.now }
});
const File = mongoose.model('File', FileSchema);

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('No authorization header');
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).send('No token');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).send('Invalid token');
  }
};

// Routes
app.post('/api/auth/mock', async (req, res) => {
  const { email } = req.body;
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, name: "Test User", isAdmin: true });
  }
  const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET);
  res.json({ token, user });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  const client = new OAuth2Client(GOOGLE_CLIENT_ID);
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) throw new Error('No payload');

    let user = await User.findOne({ email: payload.email });
    if (!user) {
      const isAdmin = payload.email === 'joachim.vanmeirvenne@atheneumkapellen.be';
      user = await User.create({
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        isAdmin
      });
    }

    const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    res.status(400).send('Auth failed');
  }
});

// File routes
app.get('/api/files', authenticate, async (req: any, res) => {
  const files = await File.find({
    $or: [
      { owner: req.user.id },
      { 'sharedWith.user': req.user.id }
    ]
  }).populate('owner', 'name email');
  res.json(files);
});

app.post('/api/files', authenticate, async (req: any, res) => {
  const file = await File.create({ ...req.body, owner: req.user.id });
  res.json(file);
});

// R Execution with Plot Support
app.post('/api/execute', authenticate, (req, res) => {
  const { code } = req.body;
  const id = Date.now();
  const tempFile = path.join('/tmp', `script_${id}.R`);
  const plotFile = path.join('/tmp', `plot_${id}.png`);
  
  // Wrap code to capture plots automatically
  const wrappedCode = `
    png("${plotFile}", width=800, height=600)
    tryCatch({
      ${code}
    }, error = function(e) {
      cat("ERROR: ", e$message, "\n")
    })
    dev.off()
  `;
  
  fs.writeFileSync(tempFile, wrappedCode);

  exec(`Rscript ${tempFile}`, (error, stdout, stderr) => {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    
    let plotBase64 = null;
    if (fs.existsSync(plotFile)) {
      const stats = fs.statSync(plotFile);
      if (stats.size > 5000) { 
        plotBase64 = fs.readFileSync(plotFile).toString('base64');
      }
      fs.unlinkSync(plotFile);
    }
    
    res.json({ stdout, stderr, plot: plotBase64, error: error?.message });
  });
});

// Socket.io for Real-time
io.on('connection', (socket) => {
  socket.on('join-file', (fileId) => {
    socket.join(fileId);
  });

  socket.on('edit-file', (data) => {
    socket.to(data.fileId).emit('file-updated', data);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
