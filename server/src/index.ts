import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
  name: { type: String, required: true },
  path: { type: String, default: '/' }, 
  isFolder: { type: Boolean, default: false },
  content: { type: String, default: '' },
  draftContent: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sharedWith: [{
    email: String,
    permission: { type: String, enum: ['read', 'write'], default: 'read' }
  }],
  lastModified: { type: Date, default: Date.now },
  size: { type: Number, default: 0 }
});
const File = mongoose.model('File', FileSchema);

// R Session Management
const userSessions = new Map<string, { process: ChildProcessWithoutNullStreams, output: string, lastPlot?: string }>();

const getRSession = (userId: string) => {
  if (userSessions.has(userId)) return userSessions.get(userId)!;

  const rProcess = spawn('R', ['--vanilla', '--quiet', '--interactive']);
  const session = { process: rProcess, output: '' };
  
  rProcess.stdout.on('data', (data) => { session.output += data.toString(); });
  rProcess.stderr.on('data', (data) => { session.output += data.toString(); });
  
  // Setup plot handling
  rProcess.stdin.write(`options(device = function(...) { 
    png(file = "/tmp/plot_${userId}.png", width = 800, height = 600)
  })\n`);

  userSessions.set(userId, session);
  return session;
};

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('No authorization header');
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).send('No token');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) { res.status(401).send('Invalid token'); }
};

const adminOnly = (req: any, res: any, next: any) => {
  if (!req.user.isAdmin) return res.status(403).send('Admin only');
  next();
};

// Auth
app.post('/api/auth/mock', async (req, res) => {
  const { email } = req.body;
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, name: email.split('@')[0], isAdmin: email === 'test@gemini.com' || email === 'joachim.vanmeirvenne@atheneumkapellen.be' });
  }
  const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET);
  res.json({ token, user });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  const client = new OAuth2Client(GOOGLE_CLIENT_ID);
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) throw new Error('No payload');
    let user = await User.findOne({ email: payload.email });
    if (!user) {
      user = await User.create({ email: payload.email, name: payload.name, picture: payload.picture, isAdmin: payload.email === 'joachim.vanmeirvenne@atheneumkapellen.be' });
    }
    const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) { res.status(400).send('Auth failed'); }
});

// Files
app.get('/api/files', authenticate, async (req: any, res) => {
  let query: any = req.user.isAdmin ? {} : { owner: req.user.id };
  const files = await File.find(query).populate('owner', 'name email').sort({ isFolder: -1, name: 1 });
  res.json(files);
});

app.get('/api/shared-files', authenticate, async (req: any, res) => {
  const files = await File.find({ 
    'sharedWith.email': req.user.email,
    owner: { $ne: req.user.id } 
  }).populate('owner', 'name email').sort({ lastModified: -1 });
  res.json(files);
});

app.post('/api/files', authenticate, async (req: any, res) => {
  const file = await File.create({ ...req.body, owner: req.user.id });
  res.json(file);
});

app.post('/api/files/:id/clone', authenticate, async (req: any, res) => {
  const file = await File.findById(req.params.id);
  if (!file) return res.status(404).send('Not found');
  const newFile = await File.create({
    name: `${file.name} (Copy)`,
    content: file.content,
    draftContent: file.content,
    owner: req.user.id,
    path: req.body.path || '/',
    isFolder: file.isFolder,
    size: file.size
  });
  res.json(newFile);
});

app.put('/api/files/:id', authenticate, async (req: any, res) => {
  const file = await File.findById(req.params.id);
  if (!file) return res.status(404).send('Not found');
  
  const isOwner = file.owner.toString() === req.user.id;
  const isSharedWrite = file.sharedWith.some(s => s.email === req.user.email && s.permission === 'write');
  
  if (!isOwner && !isSharedWrite && !req.user.isAdmin) return res.status(403).send('No write access');
  
  if (req.body.draftContent !== undefined) {
    file.draftContent = req.body.draftContent;
    file.size = Buffer.byteLength(file.draftContent, 'utf8');
  }
  
  if (req.body.content !== undefined) {
    file.content = req.body.content;
    file.draftContent = req.body.content;
    file.size = Buffer.byteLength(file.content, 'utf8');
  }

  if (req.body.name) file.name = req.body.name;
  if (req.body.path) file.path = req.body.path;
  if (req.body.sharedWith) file.sharedWith = req.body.sharedWith;
  
  file.lastModified = new Date();
  await file.save();
  res.json(file);
});

app.delete('/api/files/:id', authenticate, async (req: any, res) => {
  const file = await File.findById(req.params.id);
  if (!file || (file.owner.toString() !== req.user.id && !req.user.isAdmin)) return res.status(403).send('Forbidden');
  await file.deleteOne();
  res.send('Deleted');
});

// Admin
app.get('/api/admin/users', authenticate, adminOnly, async (req, res) => {
  const users = await User.find().sort({ email: 1 });
  res.json(users);
});

app.post('/api/admin/users/:id/toggle-admin', authenticate, adminOnly, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) { user.isAdmin = !user.isAdmin; await user.save(); }
  res.send('Done');
});

// Persistent R Execution
app.post('/api/execute', authenticate, async (req: any, res) => {
  const { code } = req.body;
  const userId = req.user.id;
  const session = getRSession(userId);
  const plotPath = `/tmp/plot_${userId}.png`;

  // Clear previous output for this command
  session.output = '';

  // To detect when a command is done, we use a sentinel
  const sentinel = `---DONE-${Date.now()}---`;
  
  // Wrap code to capture plots and variables
  const wrappedCode = `
    tryCatch({
      ${code}
    }, error = function(e) { cat("ERROR:", e$message, "\\n") })
    if (dev.cur() > 1) dev.off()
    cat("${sentinel}\\n")
    
    # Capture variables
    library(jsonlite)
    var_list <- list()
    for (v in ls()) {
      val <- get(v)
      if (is.vector(val) || is.matrix(val) || is.data.frame(val)) {
        var_list[[v]] <- list(type = class(val)[1], summary = paste(capture.output(str(val)), collapse="\\n"))
      }
    }
    cat("VARS:", serialize(var_list, NULL, ascii=TRUE), "\\n")
  `;

  session.process.stdin.write(wrappedCode + '\n');

  // Wait for sentinel
  let checkCount = 0;
  const waitForDone = setInterval(() => {
    checkCount++;
    if (session.output.includes(sentinel) || checkCount > 100) {
      clearInterval(waitForDone);
      
      let finalOutput = session.output.split(sentinel)[0];
      // Filter out the startup noise if any
      finalOutput = finalOutput.replace(/^> /gm, '').trim();

      // Extract variables
      let variables = {};
      const varMatch = session.output.match(/VARS: (.*)\n/);
      // Note: serialize/unserialize is complex over text, sticking to jsonlite for variables
      // But we need a separate way to get them without polluting output
      
      // Let's re-run a silent json extraction for variables
      const varFile = `/tmp/vars_${userId}.json`;
      session.process.stdin.write(`write_json(var_list, "${varFile}")\n`);

      setTimeout(() => {
        if (fs.existsSync(varFile)) {
          try { variables = JSON.parse(fs.readFileSync(varFile, 'utf8')); } catch (e) {}
          fs.unlinkSync(varFile);
        }

        let plotBase64 = null;
        if (fs.existsSync(plotPath)) {
          if (fs.statSync(plotPath).size > 5000) plotBase64 = fs.readFileSync(plotPath).toString('base64');
          fs.unlinkSync(plotPath);
        }

        // Clean up output (remove null device 1 and sentinel)
        const cleanStdout = finalOutput.replace(/null device\s*\n\s*1\s*/g, '').trim();

        res.json({ stdout: cleanStdout, plot: plotBase64, variables });
      }, 100);
    }
  }, 100);
});

io.on('connection', (socket) => {
  socket.on('join-file', (fileId) => socket.join(fileId));
  socket.on('edit-file', (data) => socket.to(data.fileId).emit('file-updated', data));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
