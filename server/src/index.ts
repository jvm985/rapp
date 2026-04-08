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

const ADMINS = [
  'joachim.vanmeirvenne@atheneumkapellen.be',
  'marc.vaneijmeren@atheneumkapellen.be',
  'ilse.vanroosbroeck@atheneumkapellen.be',
  'test@gemini.com'
];

// Schemas
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  picture: String,
  isAdmin: { type: Boolean, default: false },
  openFileIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'File' }]
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
const userSessions = new Map<string, { process: ChildProcessWithoutNullStreams, output: string }>();

const getRSession = (userId: string) => {
  if (userSessions.has(userId)) return userSessions.get(userId)!;

  const rProcess = spawn('R', ['--vanilla', '--quiet', '--interactive']);
  const session = { process: rProcess, output: '' };
  
  rProcess.stdout.on('data', (data) => { session.output += data.toString(); });
  rProcess.stderr.on('data', (data) => { session.output += data.toString(); });
  
  // Multiple plot support with %03d
  rProcess.stdin.write(`options(device = function(...) { 
    png(file = "/tmp/plot_${userId}_%03d.png", width = 800, height = 600)
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
    user = await User.create({ email, name: email.split('@')[0], isAdmin: ADMINS.includes(email) });
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
      user = await User.create({ email: payload.email, name: payload.name, picture: payload.picture, isAdmin: ADMINS.includes(payload.email) });
    }
    const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) { res.status(400).send('Auth failed'); }
});

app.put('/api/user/open-files', authenticate, async (req: any, res) => {
  await User.findByIdAndUpdate(req.user.id, { openFileIds: req.body.fileIds });
  res.send('Updated');
});

// Files
app.get('/api/files', authenticate, async (req: any, res) => {
  let query: any = req.user.isAdmin ? {} : { owner: req.user.id };
  const files = await File.find(query).populate('owner', 'name email').sort({ isFolder: -1, name: 1 });
  res.json(files);
});

app.get('/api/shared-files', authenticate, async (req: any, res) => {
  // Find all folders shared with this user
  const sharedFolders = await File.find({
    isFolder: true,
    $or: [
      { 'sharedWith.email': req.user.email },
      { 'sharedWith.email': 'everyone' }
    ]
  });

  const sharedPaths = sharedFolders.map(f => ({ owner: f.owner, fullPath: f.path + f.name + '/' }));

  const query = {
    owner: { $ne: req.user.id },
    $or: [
      { 'sharedWith.email': req.user.email },
      { 'sharedWith.email': 'everyone' }
    ]
  };

  const directlyShared = await File.find(query).populate('owner', 'name email');
  const additionalFiles: any[] = [];
  for (const sp of sharedPaths) {
    const children = await File.find({
      owner: sp.owner,
      path: new RegExp('^' + sp.fullPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      _id: { $nin: directlyShared.map(d => d._id) }
    }).populate('owner', 'name email');
    additionalFiles.push(...children);
  }

  const allShared = [...directlyShared, ...additionalFiles].sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });
  res.json(allShared);
});

app.post('/api/files', authenticate, async (req: any, res) => {
  if (req.body.path && req.body.path !== '/') {
    const parts = req.body.path.split('/').filter(Boolean);
    let currentCheckPath = '/';
    for (const part of parts) {
      const folderName = part;
      const folderExists = await File.findOne({ owner: req.user.id, name: folderName, path: currentCheckPath, isFolder: true });
      if (!folderExists) {
        await File.create({ name: folderName, isFolder: true, path: currentCheckPath, owner: req.user.id });
      }
      currentCheckPath += folderName + '/';
    }
  }
  const file = await File.create({ ...req.body, owner: req.user.id });
  io.emit('files-changed', { ownerId: req.user.id }); // Notify for instant refresh
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
  io.emit('files-changed', { ownerId: req.user.id });
  res.json(newFile);
});

app.put('/api/files/:id', authenticate, async (req: any, res) => {
  const file = await File.findById(req.params.id);
  if (!file) return res.status(404).send('Not found');
  
  const isOwner = file.owner.toString() === req.user.id;
  let isSharedWrite = file.sharedWith.some(s => (s.email === req.user.email || s.email === 'everyone') && s.permission === 'write');
  
  if (!isOwner && !isSharedWrite && !req.user.isAdmin) {
    const pathParts = file.path.split('/').filter(Boolean);
    let currentPath = '/';
    for (const part of pathParts) {
      const parent = await File.findOne({ owner: file.owner, name: part, path: currentPath, isFolder: true });
      if (parent && parent.sharedWith.some(s => (s.email === req.user.email || s.email === 'everyone') && s.permission === 'write')) {
        isSharedWrite = true;
        break;
      }
      currentPath += part + '/';
    }
  }
  
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
  io.emit('files-changed', { ownerId: file.owner });
  res.json(file);
});

app.delete('/api/files/:id', authenticate, async (req: any, res) => {
  const file = await File.findById(req.params.id);
  if (!file || (file.owner.toString() !== req.user.id && !req.user.isAdmin)) return res.status(403).send('Forbidden');
  const ownerId = file.owner;
  await file.deleteOne();
  io.emit('files-changed', { ownerId });
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
  const { code, currentPath } = req.body;
  const userId = req.user.id;
  const session = getRSession(userId);
  const workDir = `/tmp/r_work_${userId}`;

  // Prepare working directory
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir);
  const pathFiles = await File.find({ owner: userId, path: currentPath, isFolder: false });
  for (const f of pathFiles) {
    fs.writeFileSync(path.join(workDir, f.name), f.draftContent || f.content || '');
  }

  // Clear previous plots for this user
  fs.readdirSync('/tmp').filter(f => f.startsWith(`plot_${userId}_`)).forEach(f => fs.unlinkSync(path.join('/tmp', f)));

  session.output = ''; 
  const sentinel = `SENTINEL_DONE_${Date.now()}`;
  const scriptPath = `/tmp/script_${userId}.R`;
  
  const wrappedCode = `
    setwd("${workDir}")
    options(warn=-1)
    suppressMessages(library(jsonlite, quietly=TRUE))
    
    # Run user code
    tryCatch({
      ${code}
    }, error = function(e) { cat("ERROR:", e$message, "\\n") })
    
    # Finalize plots
    while(dev.cur() > 1) dev.off()
    cat("${sentinel}\\n")
    
    # Capture variables - filter system ones
    var_list <- list()
    all_objs <- ls(all.names=FALSE)
    for (v in all_objs) {
      if (v == "var_list" || v == "all_objs") next
      val <- get(v)
      # Only show non-functions and non-environments
      if (!is.function(val) && !is.environment(val)) {
        var_list[[v]] <- list(type = class(val)[1], summary = paste(capture.output(str(val)), collapse="\\n"))
      }
    }
    write_json(var_list, "/tmp/vars_${userId}.json")
  `;

  fs.writeFileSync(scriptPath, wrappedCode);
  session.process.stdin.write(`source("${scriptPath}", echo=FALSE, verbose=FALSE, print.eval=TRUE)\n`);

  let checkCount = 0;
  const waitForDone = setInterval(() => {
    checkCount++;
    if (session.output.includes(sentinel) || checkCount > 200) {
      clearInterval(waitForDone);
      
      let finalOutput = session.output.split(sentinel)[0];
      
      // Cleanup all wrapper code echoes
      finalOutput = finalOutput.replace(new RegExp(`source\\("${scriptPath}".*\\)`, 'g'), '');
      finalOutput = finalOutput.replace(/options\(device = function\(\.\.\.\) \{.*\n.*\n\s*\}\)/g, '');
      finalOutput = finalOutput.replace(/setwd\(".*"\)/g, '');
      finalOutput = finalOutput.replace(/options\(warn=-1\)/g, '');
      finalOutput = finalOutput.replace(/suppressMessages\(library\(jsonlite, quietly=TRUE\)\)/g, '');
      finalOutput = finalOutput.replace(/tryCatch\(\{/g, '');
      finalOutput = finalOutput.replace(/while\(dev\.cur\(\) > 1\) dev\.off\(\)/g, '');
      finalOutput = finalOutput.replace(/cat\("SENTINEL_DONE_.*\n/g, '');
      
      // Remove any line containing the script path (some R versions echo it differently)
      const lines = finalOutput.split('\n').filter(l => !l.includes(scriptPath) && !l.includes('ryCatch') && !l.includes('dev.cur'));
      finalOutput = lines.join('\n').replace(/^> /gm, '').replace(/^\+ /gm, '').trim();

      const varFile = `/tmp/vars_${userId}.json`;
      let variables = {};
      
      setTimeout(() => {
        if (fs.existsSync(varFile)) {
          try { variables = JSON.parse(fs.readFileSync(varFile, 'utf8')); } catch (e) {}
          fs.unlinkSync(varFile);
        }

        // Capture ALL generated plots
        const plotFiles = fs.readdirSync('/tmp').filter(f => f.startsWith(`plot_${userId}_`)).sort();
        const plots = plotFiles.map(f => fs.readFileSync(path.join('/tmp', f)).toString('base64'));
        plotFiles.forEach(f => fs.unlinkSync(path.join('/tmp', f)));

        const cleanStdout = finalOutput.replace(/null device\s*\n\s*1\s*/g, '').trim();
        res.json({ stdout: cleanStdout, plots, variables });
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      }, 200);
    }
  }, 100);
});

io.on('connection', (socket) => {
  socket.on('join-file', (fileId) => socket.join(fileId));
  socket.on('edit-file', (data) => {
    // Broadcast edit to everyone else in the file room
    socket.to(data.fileId).emit('file-updated', data);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
