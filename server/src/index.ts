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
  name: { type: String, required: true },
  path: { type: String, default: '/' }, // For folder support
  isFolder: { type: Boolean, default: false },
  content: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sharedWith: [{
    email: String,
    permission: { type: String, enum: ['read', 'write'], default: 'read' }
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
  } catch (err) { res.status(401).send('Invalid token'); }
};

const adminOnly = (req: any, res: any, next: any) => {
  if (!req.user.isAdmin) return res.status(403).send('Admin only');
  next();
};

// --- Routes ---

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
  let query: any = { $or: [{ owner: req.user.id }, { 'sharedWith.email': req.user.email }] };
  if (req.user.isAdmin) query = {};
  const files = await File.find(query).populate('owner', 'name email').sort({ isFolder: -1, name: 1 });
  res.json(files);
});

app.post('/api/files', authenticate, async (req: any, res) => {
  const file = await File.create({ ...req.body, owner: req.user.id });
  res.json(file);
});

app.put('/api/files/:id', authenticate, async (req: any, res) => {
  const file = await File.findById(req.params.id);
  if (!file) return res.status(404).send('Not found');
  const canWrite = file.owner.toString() === req.user.id || file.sharedWith.some(s => s.email === req.user.email && s.permission === 'write') || req.user.isAdmin;
  if (!canWrite) return res.status(403).send('No write access');
  Object.assign(file, req.body);
  file.lastModified = new Date();
  await file.save();
  res.json(file);
});

app.delete('/api/files/:id', authenticate, async (req: any, res) => {
  const file = await File.findById(req.params.id);
  if (!file || (file.owner.toString() !== req.user.id && !req.user.isAdmin)) return res.status(403).send('Forbidden');
  // If folder, delete sub-items? For now just the item.
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

// R Execution
app.post('/api/execute', authenticate, (req, res) => {
  const { code } = req.body;
  const id = Date.now();
  const tempFile = path.join('/tmp', `script_${id}.R`);
  const plotFile = path.join('/tmp', `plot_${id}.png`);
  const varFile = path.join('/tmp', `vars_${id}.json`);
  
  const wrappedCode = `
    library(jsonlite)
    png("${plotFile}", width=800, height=600)
    tryCatch({ ${code} }, error = function(e) { cat("ERROR:", e$message, "\\n") })
    dev.off()
    var_list <- list()
    for (v in ls()) {
      val <- get(v)
      if (is.vector(val) || is.matrix(val) || is.data.frame(val)) {
        var_list[[v]] <- list(type = class(val)[1], summary = paste(capture.output(str(val)), collapse="\\n"))
      }
    }
    write_json(var_list, "${varFile}")
  `;
  
  fs.writeFileSync(tempFile, wrappedCode);
  exec(`Rscript ${tempFile}`, (error, stdout, stderr) => {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    let plotBase64 = null;
    if (fs.existsSync(plotFile)) {
      if (fs.statSync(plotFile).size > 5000) plotBase64 = fs.readFileSync(plotFile).toString('base64');
      fs.unlinkSync(plotFile);
    }
    let variables = {};
    if (fs.existsSync(varFile)) {
      try { variables = JSON.parse(fs.readFileSync(varFile, 'utf8')); } catch (e) {}
      fs.unlinkSync(varFile);
    }
    res.json({ stdout, stderr, plot: plotBase64, variables, error: error?.message });
  });
});

io.on('connection', (socket) => {
  socket.on('join-file', (fileId) => socket.join(fileId));
  socket.on('edit-file', (data) => socket.to(data.fileId).emit('file-updated', data));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
