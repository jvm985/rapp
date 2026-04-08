import { useState, useEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import Editor from '@monaco-editor/react';
import { 
  Play, Save, FileText, Layout, LogOut, Plus, Trash2, UserCog, X, 
  FolderPlus, Folder, Database, ChevronRight, Home, Eraser, 
  Download, Copy, Scissors, Clipboard, Share2, Edit3, ChevronLeft,
  Upload, MoreHorizontal, RefreshCw
} from 'lucide-react';
import io from 'socket.io-client';
import axios from 'axios';

const GOOGLE_CLIENT_ID = '339058057860-i6ne31mqs27mqm2ulac7al9vi26pmgo1.apps.googleusercontent.com';
const socket = io(window.location.origin, { path: '/socket.io' });

function App() {
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [output, setOutput] = useState('');
  const [plots, setPlots] = useState<string[]>([]);
  const [plotIndex, setPlotIndex] = useState(-1);
  const [variables, setVariables] = useState<any>({});
  const [files, setFiles] = useState<any[]>([]);
  const [sharedFiles, setSharedFiles] = useState<any[]>([]);
  const [openFiles, setOpenFiles] = useState<any[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [rightTab, setRightTab] = useState<'files' | 'vars'>('files');
  const [sidebarTab, setSidebarTab] = useState<'my' | 'shared'>('my');
  const [currentPath, setCurrentPath] = useState('/');
  
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{ ids: string[], action: 'copy' | 'cut' } | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<'upload' | 'more' | null>(null);

  // Custom Resize State
  const [leftWidth, setLeftWidth] = useState(65); 
  const [editorHeight, setEditorHeight] = useState(70);
  const [fileManagerHeight, setFileManagerHeight] = useState(40);

  const editorRef = useRef<any>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const isResizingH = useRef(false);
  const isResizingV = useRef(false);
  const isResizingR = useRef(false);

  useEffect(() => { document.title = "R"; }, []);

  // Initialization
  useEffect(() => {
    if (token) {
      const init = async () => {
        const allFiles = await fetchFiles();
        const shared = await fetchSharedFiles();
        
        // Restore open files from user profile
        if (user.openFileIds && user.openFileIds.length > 0) {
          const combined = [...allFiles, ...shared];
          const restored = combined.filter((f: any) => user.openFileIds.includes(f._id));
          setOpenFiles(restored.map(f => ({ ...f, draftContent: f.draftContent || f.content || '' })));
          if (restored.length > 0) setActiveFileId(restored[0]._id);
        }
        
        if (user.isAdmin) fetchUsers();
      };
      init();
    }
  }, [token]);

  // Sync open files to server
  useEffect(() => {
    if (token && openFiles.length > 0) {
      const fileIds = openFiles.map(f => f._id);
      axios.put('/api/user/open-files', { fileIds }, { headers: { Authorization: `Bearer ${token}` } });
    }
  }, [openFiles, token]);

  useEffect(() => {
    const handleUpdate = (data: any) => {
      setOpenFiles(prev => prev.map(f => f._id === data.fileId ? { ...f, draftContent: data.content } : f));
    };
    socket.on('file-updated', handleUpdate);
    return () => { socket.off('file-updated'); };
  }, []);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [output]);

  const fetchFiles = async () => {
    try {
      const res = await axios.get('/api/files', { headers: { Authorization: `Bearer ${token}` } });
      setFiles(res.data);
      return res.data;
    } catch (e) { console.error(e); return []; }
  };

  const fetchSharedFiles = async () => {
    try {
      const res = await axios.get('/api/shared-files', { headers: { Authorization: `Bearer ${token}` } });
      setSharedFiles(res.data);
      return res.data;
    } catch (e) { console.error(e); return []; }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      setUsers(res.data);
    } catch (e) {}
  };

  const handleLogout = () => {
    localStorage.clear(); setUser(null); setToken(null); setFiles([]); window.location.reload();
  };

  const createFile = async (isFolder = false) => {
    const name = prompt(isFolder ? 'Map naam:' : 'Bestandsnaam:');
    if (!name) return;
    const res = await axios.post('/api/files', { name, isFolder, path: currentPath }, { headers: { Authorization: `Bearer ${token}` } });
    fetchFiles();
    if (!isFolder) openFile(res.data);
  };

  const openFile = (file: any) => {
    if (file.isFolder) {
      // For shared folders, we need to handle the path carefully
      if (sidebarTab === 'shared') {
        // Just set the path to folder's path + name
        setCurrentPath(file.path + file.name + '/');
      } else {
        setCurrentPath(currentPath === '/' ? `/${file.name}/` : `${currentPath}${file.name}/`);
      }
      return;
    }
    if (!openFiles.find(f => f._id === file._id)) {
      setOpenFiles([...openFiles, { ...file, draftContent: file.draftContent || file.content || '' }]);
    }
    setActiveFileId(file._id);
  };

  const closeFile = (e: any, id: string) => {
    e.stopPropagation();
    const nextFiles = openFiles.filter(f => f._id !== id);
    setOpenFiles(nextFiles);
    if (activeFileId === id) setActiveFileId(nextFiles.length > 0 ? nextFiles[nextFiles.length - 1]._id : null);
  };

  const activeFile = openFiles.find(f => f._id === activeFileId);

  const saveFile = async () => {
    if (!activeFileId || !activeFile) return;
    setIsSaving(true);
    await axios.put(`/api/files/${activeFileId}`, { content: activeFile.draftContent }, { headers: { Authorization: `Bearer ${token}` } });
    setOpenFiles(prev => prev.map(f => f._id === activeFileId ? { ...f, content: activeFile.draftContent } : f));
    setIsSaving(false); 
    fetchFiles();
  };

  const saveDraft = async (id: string, content: string) => {
    await axios.put(`/api/files/${id}`, { draftContent: content }, { headers: { Authorization: `Bearer ${token}` } });
  };

  const debouncedSaveDraft = useRef<any>(null);

  const handleEditorChange = (value: any) => {
    if (!activeFileId) return;
    setOpenFiles(prev => prev.map(f => f._id === activeFileId ? { ...f, draftContent: value } : f));
    socket.emit('edit-file', { fileId: activeFileId, content: value, userEmail: user.email });
    
    if (debouncedSaveDraft.current) clearTimeout(debouncedSaveDraft.current);
    debouncedSaveDraft.current = setTimeout(() => saveDraft(activeFileId, value), 1000);
  };

  const runCode = async () => {
    if (!editorRef.current) return;
    const selection = editorRef.current.getSelection();
    const model = editorRef.current.getModel();
    let codeToRun = '';
    let shouldMoveCursor = false;

    if (selection && !selection.isEmpty()) {
      codeToRun = model.getValueInRange(selection);
    } else {
      const position = editorRef.current.getPosition();
      codeToRun = model.getLineContent(position.lineNumber);
      shouldMoveCursor = true;
    }

    if (!codeToRun.trim()) return;

    setOutput(prev => prev + '> ' + codeToRun + '\n');
    
    if (shouldMoveCursor) {
      const position = editorRef.current.getPosition();
      const lineCount = model.getLineCount();
      if (position.lineNumber < lineCount) {
        editorRef.current.setPosition({ lineNumber: position.lineNumber + 1, column: 1 });
        editorRef.current.revealLine(position.lineNumber + 1);
      }
      editorRef.current.focus();
    }

    try {
      const res = await axios.post('/api/execute', { code: codeToRun, currentPath }, { headers: { Authorization: `Bearer ${token}` } });
      const newOutput = (res.data.stdout || res.data.stderr || res.data.error || '').trim();
      if (newOutput) setOutput(prev => prev + newOutput + '\n');
      if (res.data.plot) {
        const newPlot = `data:image/png;base64,${res.data.plot}`;
        setPlots(prev => [...prev, newPlot]);
        setPlotIndex(plots.length); 
      }
      if (res.data.variables) setVariables(res.data.variables);
    } catch (err) { setOutput(prev => prev + 'Fout bij uitvoeren.\n'); }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedFileIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedFileIds(next);
  };

  const renameSelected = async () => {
    if (selectedFileIds.size !== 1) return;
    const id = Array.from(selectedFileIds)[0];
    const file = files.find(f => f._id === id);
    const newName = prompt('Nieuwe naam:', file.name);
    if (!newName || newName === file.name) return;
    await axios.put(`/api/files/${id}`, { name: newName }, { headers: { Authorization: `Bearer ${token}` } });
    fetchFiles();
  };

  const deleteSelected = async () => {
    if (selectedFileIds.size === 0) return;
    if (!confirm(`Zeker weten dat je ${selectedFileIds.size} item(s) wilt verwijderen?`)) return;
    for (const id of Array.from(selectedFileIds)) {
      await axios.delete(`/api/files/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (activeFileId === id) { setActiveFileId(null); setOpenFiles(prev => prev.filter(f => f._id !== id)); }
    }
    setSelectedFileIds(new Set());
    fetchFiles();
  };

  const shareSelected = async () => {
    if (selectedFileIds.size !== 1) return;
    const id = Array.from(selectedFileIds)[0];
    const file = files.find(f => f._id === id);
    
    let email = '';
    if (user.isAdmin && confirm('Delen met iedereen (ja) of specifieke gebruiker (nee)?')) {
      email = 'everyone';
    } else {
      email = prompt('Email van de gebruiker:') || '';
    }
    
    if (!email) return;
    
    const writeResponse = prompt('Mag deze gebruiker ook aanpassen? (Typ "ja" voor schrijven, "nee" voor alleen lezen)');
    if (writeResponse === null) return; // Cancelled
    const perm = writeResponse.toLowerCase() === 'ja' ? 'write' : 'read';
    
    const sharedWith = [...(file.sharedWith || []), { email, permission: perm }];
    await axios.put(`/api/files/${id}`, { sharedWith }, { headers: { Authorization: `Bearer ${token}` } });
    fetchFiles();
    setActiveDropdown(null);
  };

  const copySelected = (action: 'copy' | 'cut') => {
    if (selectedFileIds.size === 0) return;
    setClipboard({ ids: Array.from(selectedFileIds), action });
    setSelectedFileIds(new Set());
    setActiveDropdown(null);
  };

  const pasteClipboard = async () => {
    if (!clipboard) return;
    for (const id of clipboard.ids) {
      if (clipboard.action === 'copy') {
        await axios.post(`/api/files/${id}/clone`, { path: currentPath }, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.put(`/api/files/${id}`, { path: currentPath }, { headers: { Authorization: `Bearer ${token}` } });
      }
    }
    setClipboard(null);
    fetchFiles();
  };

  const downloadSelected = () => {
    selectedFileIds.forEach(id => {
      const file = files.find(f => f._id === id);
      if (file && !file.isFolder) {
        const blob = new Blob([file.content || ''], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name.endsWith('.R') ? file.name : `${file.name}.R`;
        a.click();
      }
    });
    setActiveDropdown(null);
  };

  const handleUpload = (isFolder = false) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (isFolder) {
      (input as any).webkitdirectory = true;
      (input as any).directory = true;
    }
    input.onchange = async (e: any) => {
      const filesToUpload = e.target.files;
      for (const file of filesToUpload) {
        const reader = new FileReader();
        reader.onload = async (res: any) => {
          const content = res.target.result;
          let uploadPath = currentPath;
          if (isFolder && file.webkitRelativePath) {
            const parts = file.webkitRelativePath.split('/');
            parts.pop(); 
            if (parts.length > 0) {
              uploadPath = currentPath + parts.join('/') + '/';
            }
          }
          const apiRes = await axios.post('/api/files', { name: file.name, path: uploadPath }, { headers: { Authorization: `Bearer ${token}` } });
          await axios.put(`/api/files/${apiRes.data._id}`, { content }, { headers: { Authorization: `Bearer ${token}` } });
          fetchFiles();
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Resize Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingV.current) setLeftWidth((e.clientX / window.innerWidth) * 100);
      else if (isResizingH.current) {
        const newH = (e.clientY / window.innerHeight) * 100;
        if (newH > 10 && newH < 90) setEditorHeight(newH);
      }
      else if (isResizingR.current) {
        const newH = (e.clientY / window.innerHeight) * 100;
        if (newH > 10 && newH < 90) setFileManagerHeight(newH);
      }
    };
    const handleMouseUp = () => { isResizingV.current = false; isResizingH.current = false; isResizingR.current = false; };
    window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, []);

  const handleLoginSuccess = async (res: any) => {
    const { data } = await axios.post('/api/auth/google', { credential: res.credential });
    setUser(data.user); setToken(data.token);
    localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user));
  };

  const handleMockLogin = (email: string) => {
    axios.post('/api/auth/mock', { email }).then(r => { 
      setUser(r.data.user); setToken(r.data.token); 
      localStorage.setItem('token', r.data.token); 
      localStorage.setItem('user', JSON.stringify(r.data.user)); 
    });
  };

  if (!user) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', width: '400px' }}>
          <h1 style={{ color: '#333' }}>R</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={() => handleMockLogin('test@gemini.com')} style={{ width: '100%', padding: '12px', background: '#4a5568', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Login als beheerder (Test)</button>
            <button onClick={() => handleMockLogin('leerlingA@irishof.cloud')} style={{ width: '100%', padding: '12px', background: '#2d3748', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Login als Leerling A</button>
            <button onClick={() => handleMockLogin('leerlingB@irishof.cloud')} style={{ width: '100%', padding: '12px', background: '#2d3748', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Login als Leerling B</button>
            <div style={{ margin: '15px 0', borderTop: '1px solid #ddd' }} />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}><GoogleLogin onSuccess={handleLoginSuccess} /></GoogleOAuthProvider>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean);
  // Shared folders logic: if a folder is shared, its children should appear when currentPath matches its full path.
  const currentFilesList = sidebarTab === 'my' 
    ? files.filter(f => f.path === currentPath) 
    : sharedFiles.filter(f => f.path === currentPath);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#1e1e1e', color: 'white' }}>
      <header style={{ height: '45px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 15px', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
          <span style={{ fontWeight: 'bold', color: '#3498db', fontSize: '18px' }}>R</span>
          <button onClick={runCode} className="btn-run"><Play size={12}/> Run</button>
          <button onClick={saveFile} className="btn-save"><Save size={12}/> {isSaving ? '...' : 'Save'}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {user.isAdmin && <button onClick={() => setShowAdmin(!showAdmin)} style={{ color: showAdmin ? '#3498db' : '#888', background: 'none', border: 'none', cursor: 'pointer' }} title="Beheer"><UserCog size={18}/></button>}
          <span style={{ fontSize: '12px' }}>{user.name}</span>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }} title="Uitloggen"><LogOut size={16}/></button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Column */}
        <div style={{ width: `${leftWidth}%`, display: 'flex', flexDirection: 'column', borderRight: '4px solid #111' }}>
          <div style={{ height: `${editorHeight}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: '35px', background: '#252526', display: 'flex', overflowX: 'auto', borderBottom: '1px solid #111', flexShrink: 0 }}>
              {openFiles.map(f => (
                <div key={f._id} onClick={() => setActiveFileId(f._id)} style={{ padding: '0 15px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', background: activeFileId === f._id ? '#1e1e1e' : '#2d2d2d', borderRight: '1px solid #111', minWidth: '120px' }}>
                  <FileText size={12} color={f.owner?._id === user.id ? (f.draftContent !== f.content ? "#e74c3c" : "#3498db") : "#f1c40f"}/>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', color: f.draftContent !== f.content ? "#e74c3c" : "inherit" }}>{f.name}</span>
                  <X size={12} onClick={(e) => closeFile(e, f._id)} className="close-icon"/>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {activeFile ? (
                <Editor 
                  height="100%" 
                  defaultLanguage="r" 
                  theme="vs-dark" 
                  value={activeFile.draftContent} 
                  onChange={handleEditorChange} 
                  onMount={(ed, monaco) => { 
                    editorRef.current = ed;
                    ed.addAction({
                      id: 'run-r-code',
                      label: 'Run R Code',
                      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
                      run: () => { runCode(); }
                    });
                  }} 
                  options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }} 
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Selecteer een bestand om te beginnen</div>
              )}
            </div>
          </div>
          <div onMouseDown={() => isResizingH.current = true} style={{ height: '4px', background: '#111', cursor: 'row-resize', zIndex: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ height: '30px', background: '#111', padding: '0 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', color: '#444', fontWeight: 'bold' }}>R CONSOLE</div>
              <button onClick={() => setOutput('')} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><Eraser size={10} /> Wissen</button>
            </div>
            <div ref={consoleRef} style={{ flex: 1, padding: '10px', overflowY: 'auto', textAlign: 'left' }}>
              <pre style={{ margin: 0, color: '#2ecc71', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{output}</pre>
            </div>
          </div>
        </div>

        <div onMouseDown={() => isResizingV.current = true} style={{ width: '4px', background: '#111', cursor: 'col-resize', zIndex: 10, flexShrink: 0 }} />

        {/* Right Column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: `${fileManagerHeight}%`, background: '#252526', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {/* Toolbar */}
            <div style={{ background: '#f8f9fa', color: '#333', padding: '4px 8px', display: 'flex', gap: '10px', borderBottom: '1px solid #ddd', alignItems: 'center', fontSize: '11px', flexShrink: 0 }}>
              <button onClick={() => { createFile(true); setActiveDropdown(null); }} className="toolbar-btn"><FolderPlus size={14} color="#27ae60"/> New Folder</button>
              <button onClick={() => { createFile(false); setActiveDropdown(null); }} className="toolbar-btn"><Plus size={14} color="#27ae60"/> New File</button>
              
              <div style={{ position: 'relative' }}>
                <button className="toolbar-btn" onClick={() => setActiveDropdown(activeDropdown === 'upload' ? null : 'upload')}><Upload size={14} color="#f39c12"/> Upload</button>
                {activeDropdown === 'upload' && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #ddd', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', zIndex: 20, minWidth: '120px', borderRadius: '4px' }}>
                    <div onClick={() => { handleUpload(false); setActiveDropdown(null); }} className="menu-item">Bestanden</div>
                    <div onClick={() => { handleUpload(true); setActiveDropdown(null); }} className="menu-item">Map</div>
                  </div>
                )}
              </div>

              <button onClick={() => { deleteSelected(); setActiveDropdown(null); }} disabled={selectedFileIds.size === 0} className="toolbar-btn"><Trash2 size={14} color="#e74c3c"/> Delete</button>
              <button onClick={() => { renameSelected(); setActiveDropdown(null); }} disabled={selectedFileIds.size !== 1} className="toolbar-btn"><Edit3 size={14} color="#3498db"/> Rename</button>
              
              <div style={{ position: 'relative' }}>
                <button onClick={() => setActiveDropdown(activeDropdown === 'more' ? null : 'more')} disabled={selectedFileIds.size === 0} className="toolbar-btn"><MoreHorizontal size={14}/> More</button>
                {activeDropdown === 'more' && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #ddd', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', zIndex: 20, minWidth: '120px', borderRadius: '4px' }}>
                    <div onClick={shareSelected} className="menu-item"><Share2 size={12}/> Share</div>
                    <div onClick={() => copySelected('copy')} className="menu-item"><Copy size={12}/> Copy</div>
                    <div onClick={() => copySelected('cut')} className="menu-item"><Scissors size={12}/> Cut</div>
                    <div onClick={downloadSelected} className="menu-item"><Download size={12}/> Download</div>
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={fetchFiles} className="toolbar-btn"><RefreshCw size={14}/></button>
            </div>
            
            <div style={{ background: '#2d2d2d', borderBottom: '1px solid #111', flexShrink: 0 }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #222' }}>
                <button onClick={() => { setSidebarTab('my'); setCurrentPath('/'); }} style={{ flex: 1, padding: '8px', background: sidebarTab === 'my' ? '#252526' : 'transparent', border: 'none', color: sidebarTab === 'my' ? 'white' : '#666', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>MIJN BESTANDEN</button>
                <button onClick={() => { setSidebarTab('shared'); setCurrentPath('/'); }} style={{ flex: 1, padding: '8px', background: sidebarTab === 'shared' ? '#252526' : 'transparent', border: 'none', color: sidebarTab === 'shared' ? 'white' : '#666', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>GEDEELD</button>
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#3498db', overflowX: 'auto' }}>
                <Home size={12} onClick={() => setCurrentPath('/')} style={{ cursor: 'pointer' }} />
                {breadcrumbs.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ChevronRight size={10} color="#444" /><span onClick={() => setCurrentPath('/' + breadcrumbs.slice(0, i + 1).join('/') + '/')} style={{ cursor: 'pointer' }}>{b}</span>
                  </div>
                ))}
                {clipboard && sidebarTab === 'my' && (
                  <div style={{ marginLeft: 'auto', cursor: 'pointer', color: '#2ecc71' }} onClick={pasteClipboard}><Clipboard size={14} /></div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#ccc' }}>
                <thead style={{ background: '#333', position: 'sticky', top: 0, zIndex: 5 }}>
                  <tr>
                    <th style={{ width: '30px', padding: '5px' }}><input type="checkbox" onChange={(e) => setSelectedFileIds(e.target.checked ? new Set(currentFilesList.map(f => f._id)) : new Set())} checked={selectedFileIds.size > 0 && selectedFileIds.size === currentFilesList.length}/></th>
                    <th style={{ textAlign: 'left', padding: '5px' }}>Name</th>
                    <th style={{ textAlign: 'right', padding: '5px', width: '60px' }}>Size</th>
                    <th style={{ textAlign: 'right', padding: '5px', width: '120px' }}>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {currentFilesList.map(f => (
                    <tr key={f._id} onClick={() => openFile(f)} style={{ background: activeFileId === f._id ? '#37373d' : 'transparent', borderBottom: '1px solid #222', cursor: 'pointer' }}>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedFileIds.has(f._id)} onChange={() => toggleSelect(f._id)}/></td>
                      <td style={{ padding: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {f.isFolder ? <Folder size={14} color="#f1c40f"/> : <FileText size={14} color={f.owner?._id === user.id ? "#3498db" : "#f1c40f"}/>}
                          <span>{f.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '5px', color: '#666' }}>{f.isFolder ? '' : (f.size > 1024 ? `${(f.size/1024).toFixed(1)} KB` : `${f.size} B`)}</td>
                      <td style={{ textAlign: 'right', padding: '5px', color: '#666', fontSize: '10px' }}>{new Date(f.lastModified).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div onMouseDown={() => isResizingR.current = true} style={{ height: '4px', background: '#111', cursor: 'row-resize', zIndex: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ display: 'flex', background: '#f8f9fa', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
              <button onClick={() => setRightTab('files')} style={{ flex: 1, padding: '8px', border: 'none', background: rightTab === 'files' ? 'white' : 'transparent', fontSize: '11px', fontWeight: 'bold', borderBottom: rightTab === 'files' ? '2px solid #3498db' : 'none', cursor: 'pointer', color: '#333' }}>PLOT</button>
              <button onClick={() => setRightTab('vars')} style={{ flex: 1, padding: '8px', border: 'none', background: rightTab === 'vars' ? 'white' : 'transparent', fontSize: '11px', fontWeight: 'bold', borderBottom: rightTab === 'vars' ? '2px solid #3498db' : 'none', cursor: 'pointer', color: '#333' }}>VARIABELEN</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              {rightTab === 'files' ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  {plots.length > 0 && (
                    <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', display: 'flex', justifyContent: 'space-between', zIndex: 5 }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => setPlotIndex(Math.max(0, plotIndex - 1))} className="plot-btn"><ChevronLeft size={14}/></button>
                        <span style={{ background: 'rgba(0,0,0,0.1)', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', color: '#333' }}>{plotIndex + 1} / {plots.length}</span>
                        <button onClick={() => setPlotIndex(Math.min(plots.length - 1, plotIndex + 1))} className="plot-btn"><ChevronRight size={14}/></button>
                      </div>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <a href={plots[plotIndex]} download={`plot_${plotIndex + 1}.png`} className="plot-btn"><Download size={14}/></a>
                        <button onClick={() => { setPlots([]); setPlotIndex(-1); }} className="plot-btn" style={{ color: '#e74c3c' }}><Trash2 size={14}/></button>
                      </div>
                    </div>
                  )}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                    {plots.length > 0 ? <img src={plots[plotIndex]} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="R Plot" /> : <Layout size={40} color="#eee"/>}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '15px', color: '#333' }}>
                  {Object.entries(variables).map(([name, info]: [string, any]) => (
                    <div key={name} style={{ marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                      <div style={{ fontWeight: 'bold', color: '#2980b9', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}><Database size={12}/>{name} <span style={{ fontWeight: 'normal', color: '#999', fontSize: '10px' }}>({info.type})</span></div>
                      <pre style={{ margin: '4px 0 0 0', fontSize: '11px', background: '#f8f9fa', padding: '4px', whiteSpace: 'pre-wrap' }}>{info.summary}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAdmin && (
        <div style={{ position: 'fixed', inset: '45px 0 0 0', background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '500px', background: '#252526', height: '100%', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2>Gebruikers Beheer</h2>
              <X onClick={() => setShowAdmin(false)} style={{ cursor: 'pointer' }}/>
            </div>
            {users.map(u => (
              <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', borderBottom: '1px solid #333' }}>
                <img src={u.picture || 'https://via.placeholder.com/32'} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px' }}>{u.name}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{u.email}</div>
                </div>
                <button onClick={async () => { await axios.post(`/api/admin/users/${u._id}/toggle-admin`, {}, { headers: { Authorization: `Bearer ${token}` } }); fetchUsers(); }} style={{ padding: '4px 10px', borderRadius: '4px', background: u.isAdmin ? '#e74c3c' : '#34495e', border: 'none', color: 'white', cursor: 'pointer' }}>
                  {u.isAdmin ? 'Ontneem Admin' : 'Maak Admin'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .toolbar-btn { background: none; border: 1px solid transparent; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 5px; border-radius: 3px; font-size: 11px; color: #333; }
        .toolbar-btn:hover:not(:disabled) { border-color: #ccc; background: #fff; }
        .toolbar-btn:disabled { opacity: 0.3; cursor: default; }
        .menu-item { padding: 8px 12px; cursor: pointer; color: #333; font-size: 11px; display: flex; align-items: center; gap: 8px; }
        .menu-item:hover { background: #f0f2f5; }
        .btn-run { background: #2ecc71; border: none; padding: 4px 12px; border-radius: 4px; color: white; cursor: pointer; display: flex; alignItems: center; gap: 6px; font-weight: bold; font-size: 12px; }
        .btn-save { background: #34495e; border: none; padding: 4px 12px; border-radius: 4px; color: white; cursor: pointer; display: flex; alignItems: center; gap: 6px; font-size: 12px; }
        .close-icon { color: #555; border-radius: 2px; }
        .close-icon:hover { background: #e74c3c; color: white; }
        .plot-btn { background: #eee; border: 1px solid #ddd; border-radius: 4px; padding: 4px; cursor: pointer; color: #666; display: flex; align-items: center; justify-content: center; }
        .plot-btn:hover { background: #e0e0e0; color: #333; }
      `}</style>
    </div>
  );
}

export default App;
