import { useState, useEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import Editor from '@monaco-editor/react';
import { Play, Save, FileText, Layout, LogOut, Plus, Trash2, UserCog, X, FolderPlus, Folder, Database, ChevronRight, Home } from 'lucide-react';
import io from 'socket.io-client';
import axios from 'axios';

const GOOGLE_CLIENT_ID = '339058057860-i6ne31mqs27mqm2ulac7al9vi26pmgo1.apps.googleusercontent.com';
const socket = io(window.location.origin, { path: '/socket.io' });

function App() {
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [output, setOutput] = useState('');
  const [plot, setPlot] = useState<string | null>(null);
  const [variables, setVariables] = useState<any>({});
  const [files, setFiles] = useState<any[]>([]);
  const [openFiles, setOpenFiles] = useState<any[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [rightTab, setRightTab] = useState<'files' | 'vars'>('files');
  const [currentPath, setCurrentPath] = useState('/');
  
  // Custom Resize State
  const [leftWidth, setLeftWidth] = useState(65); 
  const [editorHeight, setEditorHeight] = useState(70);
  const [fileManagerHeight, setFileManagerHeight] = useState(40);

  const editorRef = useRef<any>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const isResizingH = useRef(false);
  const isResizingV = useRef(false);
  const isResizingR = useRef(false);

  useEffect(() => {
    if (token) {
      fetchFiles();
      if (user.isAdmin) fetchUsers();
    }
  }, [token]);

  useEffect(() => {
    const handleUpdate = (data: any) => {
      setOpenFiles(prev => prev.map(f => f._id === data.fileId ? { ...f, content: data.content } : f));
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
    } catch (e) { console.error(e); }
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
      setCurrentPath(currentPath === '/' ? `/${file.name}/` : `${currentPath}${file.name}/`);
      return;
    }
    if (!openFiles.find(f => f._id === file._id)) {
      setOpenFiles([...openFiles, { ...file, content: file.content || '' }]);
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
    await axios.put(`/api/files/${activeFileId}`, { content: activeFile.content }, { headers: { Authorization: `Bearer ${token}` } });
    setIsSaving(false); fetchFiles();
  };

  const runCode = async () => {
    if (!editorRef.current) return;
    const selection = editorRef.current.getSelection();
    let codeToRun = '';
    let shouldMoveCursor = false;

    if (selection && !selection.isEmpty()) {
      codeToRun = editorRef.current.getModel().getValueInRange(selection);
    } else {
      const position = editorRef.current.getPosition();
      codeToRun = editorRef.current.getModel().getLineContent(position.lineNumber);
      shouldMoveCursor = true;
    }

    if (!codeToRun.trim()) return;

    setOutput(prev => prev + '> ' + codeToRun + '\n');
    
    // Move cursor to next line if it was a single line run
    if (shouldMoveCursor) {
      const position = editorRef.current.getPosition();
      editorRef.current.setPosition({ lineNumber: position.lineNumber + 1, column: 1 });
      editorRef.current.revealLine(position.lineNumber + 1);
      editorRef.current.focus();
    }

    try {
      const res = await axios.post('/api/execute', { code: codeToRun }, { headers: { Authorization: `Bearer ${token}` } });
      setOutput(prev => prev + (res.data.stdout || res.data.stderr || res.data.error || '') + '\n');
      if (res.data.plot) setPlot(`data:image/png;base64,${res.data.plot}`);
      if (res.data.variables) setVariables(res.data.variables);
    } catch (err) { setOutput(prev => prev + 'Fout bij uitvoeren.\n'); }
  };

  const handleEditorChange = (value: any) => {
    if (!activeFileId) return;
    setOpenFiles(prev => prev.map(f => f._id === activeFileId ? { ...f, content: value } : f));
    socket.emit('edit-file', { fileId: activeFileId, content: value, userEmail: user.email });
  };

  // Resize Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingV.current) {
        setLeftWidth((e.clientX / window.innerWidth) * 100);
      } else if (isResizingH.current) {
        setEditorHeight((e.clientY / window.innerHeight) * 100);
      } else if (isResizingR.current) {
        setFileManagerHeight((e.clientY / window.innerHeight) * 100);
      }
    };
    const handleMouseUp = () => {
      isResizingV.current = false; isResizingH.current = false; isResizingR.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleLoginSuccess = async (res: any) => {
    const { data } = await axios.post('/api/auth/google', { credential: res.credential });
    setUser(data.user); setToken(data.token);
    localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user));
  };

  if (!user) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', width: '400px' }}>
          <h1>Irishof R Editor</h1>
          <button onClick={() => { axios.post('/api/auth/mock', { email: 'test@gemini.com' }).then(r => { setUser(r.data.user); setToken(r.data.token); localStorage.setItem('token', r.data.token); localStorage.setItem('user', JSON.stringify(r.data.user)); }) }} style={{ width: '100%', padding: '12px', background: '#4a5568', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '15px' }}>Login als test@gemini.com</button>
          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}><GoogleLogin onSuccess={handleLoginSuccess} /></GoogleOAuthProvider>
        </div>
      </div>
    );
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean);
  const filteredFiles = files.filter(f => f.path === currentPath);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#1e1e1e', color: 'white' }}>
      <header style={{ height: '45px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 15px', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
          <span style={{ fontWeight: 'bold', color: '#3498db', fontSize: '14px' }}>R Editor</span>
          <button onClick={runCode} className="btn-run"><Play size={12}/> Run</button>
          <button onClick={saveFile} className="btn-save"><Save size={12}/> {isSaving ? '...' : 'Save'}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {user.isAdmin && <button onClick={() => setShowAdmin(!showAdmin)} style={{ color: showAdmin ? '#3498db' : '#888', background: 'none', border: 'none', cursor: 'pointer' }}><UserCog size={18}/></button>}
          <span style={{ fontSize: '12px' }}>{user.name}</span>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><LogOut size={16}/></button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Column */}
        <div style={{ width: `${leftWidth}%`, display: 'flex', flexDirection: 'column', borderRight: '4px solid #111' }}>
          <div style={{ height: `${editorHeight}%`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: '35px', background: '#252526', display: 'flex', overflowX: 'auto', borderBottom: '1px solid #111' }}>
              {openFiles.map(f => (
                <div key={f._id} onClick={() => setActiveFileId(f._id)} style={{ padding: '0 15px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', background: activeFileId === f._id ? '#1e1e1e' : '#2d2d2d', borderRight: '1px solid #111', minWidth: '120px' }}>
                  <FileText size={12} color="#3498db"/>
                  <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{f.name}</span>
                  <X size={12} onClick={(e) => closeFile(e, f._id)} className="close-icon"/>
                </div>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              {activeFile ? (
                <Editor height="100%" defaultLanguage="r" theme="vs-dark" value={activeFile.content} onChange={handleEditorChange} onMount={(ed) => editorRef.current = ed} options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Selecteer een bestand om te beginnen</div>
              )}
            </div>
          </div>
          <div onMouseDown={() => isResizingH.current = true} style={{ height: '4px', background: '#111', cursor: 'row-resize', zIndex: 10 }} />
          <div ref={consoleRef} style={{ flex: 1, background: '#000', padding: '10px', overflowY: 'auto', textAlign: 'left' }}>
            <div style={{ fontSize: '10px', color: '#444', fontWeight: 'bold', marginBottom: '5px' }}>R CONSOLE</div>
            <pre style={{ margin: 0, color: '#2ecc71', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{output}</pre>
          </div>
        </div>

        <div onMouseDown={() => isResizingV.current = true} style={{ width: '4px', background: '#111', cursor: 'col-resize', zIndex: 10 }} />

        {/* Right Column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: `${fileManagerHeight}%`, background: '#252526', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', background: '#2d2d2d', borderBottom: '1px solid #111' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#888' }}>FILE MANAGER</span>
                <div style={{ display: 'flex', gap: '10px', color: '#888' }}>
                  <FolderPlus size={14} onClick={() => createFile(true)} style={{ cursor: 'pointer' }} />
                  <Plus size={16} onClick={() => createFile(false)} style={{ cursor: 'pointer' }} />
                </div>
              </div>
              {/* Breadcrumbs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#3498db', overflowX: 'auto' }}>
                <Home size={12} onClick={() => setCurrentPath('/')} style={{ cursor: 'pointer' }} />
                {breadcrumbs.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ChevronRight size={10} color="#444" />
                    <span 
                      onClick={() => setCurrentPath('/' + breadcrumbs.slice(0, i + 1).join('/') + '/')} 
                      style={{ cursor: 'pointer' }}
                    >
                      {b}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '5px' }}>
              {filteredFiles.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: '#444', fontSize: '12px' }}>Map is leeg.</div>}
              {filteredFiles.map(f => (
                <div key={f._id} onClick={() => openFile(f)} style={{ padding: '6px 10px', fontSize: '13px', cursor: 'pointer', background: activeFileId === f._id ? '#37373d' : 'transparent', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px' }}>
                  {f.isFolder ? <Folder size={14} color="#f1c40f"/> : <FileText size={14} color="#3498db"/>}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  <Trash2 size={12} onClick={(e) => { e.stopPropagation(); axios.delete(`/api/files/${f._id}`, { headers: { Authorization: `Bearer ${token}` } }).then(fetchFiles); }} style={{ color: '#444' }}/>
                </div>
              ))}
            </div>
          </div>
          <div onMouseDown={() => isResizingR.current = true} style={{ height: '4px', background: '#111', cursor: 'row-resize', zIndex: 10 }} />
          <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', background: '#f8f9fa', borderBottom: '1px solid #ddd' }}>
              <button onClick={() => setRightTab('files')} style={{ flex: 1, padding: '8px', border: 'none', background: rightTab === 'files' ? 'white' : 'transparent', fontSize: '11px', fontWeight: 'bold', borderBottom: rightTab === 'files' ? '2px solid #3498db' : 'none', cursor: 'pointer', color: '#333' }}>PLOT</button>
              <button onClick={() => setRightTab('vars')} style={{ flex: 1, padding: '8px', border: 'none', background: rightTab === 'vars' ? 'white' : 'transparent', fontSize: '11px', fontWeight: 'bold', borderBottom: rightTab === 'vars' ? '2px solid #3498db' : 'none', cursor: 'pointer', color: '#333' }}>VARIABELEN</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {rightTab === 'files' ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  {plot ? <img src={plot} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="R Plot" /> : <Layout size={40} color="#eee"/>}
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
        .btn-run { background: #2ecc71; border: none; padding: 4px 12px; border-radius: 4px; color: white; cursor: pointer; display: flex; alignItems: center; gap: 6px; font-weight: bold; font-size: 12px; }
        .btn-save { background: #34495e; border: none; padding: 4px 12px; border-radius: 4px; color: white; cursor: pointer; display: flex; alignItems: center; gap: 6px; font-size: 12px; }
        .close-icon { color: #555; border-radius: 2px; }
        .close-icon:hover { background: #e74c3c; color: white; }
      `}</style>
    </div>
  );
}

export default App;
