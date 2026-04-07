import { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import Editor from '@monaco-editor/react';
import { Play, Save, FileText, Layout, LogOut, Plus, Share2, Trash2, UserCog, X, Upload, Database } from 'lucide-react';
import io from 'socket.io-client';
import axios from 'axios';

const GOOGLE_CLIENT_ID = '339058057860-i6ne31mqs27mqm2ulac7al9vi26pmgo1.apps.googleusercontent.com';
const socket = io(window.location.origin, { path: '/socket.io' });

function App() {
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [code, setCode] = useState('# Welkom!\n# Typ hier je R code\nx <- rnorm(100)\nplot(x, col="red")');
  const [output, setOutput] = useState('');
  const [plot, setPlot] = useState<string | null>(null);
  const [variables, setVariables] = useState<any>({});
  const [files, setFiles] = useState<any[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [rightTab, setRightTab] = useState<'files' | 'vars'>('files');

  useEffect(() => {
    if (token) {
      fetchFiles();
      if (user.isAdmin) fetchUsers();
    }
  }, [token]);

  useEffect(() => {
    if (activeFileId) {
      socket.emit('join-file', activeFileId);
    }
    const handleUpdate = (data: any) => {
      if (data.fileId === activeFileId && data.userEmail !== user.email) {
        setCode(data.content);
      }
    };
    socket.on('file-updated', handleUpdate);
    return () => { socket.off('file-updated'); };
  }, [activeFileId]);

  const fetchFiles = async () => {
    try {
      const res = await axios.get('/api/files', { headers: { Authorization: `Bearer ${token}` } });
      setFiles(res.data);
    } catch (e) { 
      console.error(e);
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      setUsers(res.data);
    } catch (e) {}
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setToken(null);
    setFiles([]);
    window.location.reload();
  };

  const createFile = async () => {
    const name = prompt('Nieuwe bestandsnaam (bijv. analyse.R):');
    if (!name) return;
    const res = await axios.post('/api/files', { name }, { headers: { Authorization: `Bearer ${token}` } });
    fetchFiles();
    openFile(res.data);
  };

  const uploadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (res: any) => {
        const content = res.target.result;
        const apiRes = await axios.post('/api/files', { name: file.name }, { headers: { Authorization: `Bearer ${token}` } });
        await axios.put(`/api/files/${apiRes.data._id}`, { content }, { headers: { Authorization: `Bearer ${token}` } });
        fetchFiles();
        openFile({ ...apiRes.data, content });
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const openFile = (file: any) => {
    setActiveFileId(file._id);
    setCode(file.content || '');
    setPlot(null);
    setOutput(`Bestand '${file.name}' geopend.`);
  };

  const saveFile = async () => {
    if (!activeFileId) return;
    setIsSaving(true);
    await axios.put(`/api/files/${activeFileId}`, { content: code }, { headers: { Authorization: `Bearer ${token}` } });
    setIsSaving(false);
    fetchFiles();
  };

  const shareFile = async () => {
    if (!activeFileId) return;
    const email = prompt('Email van de gebruiker:');
    if (!email) return;
    const perm = confirm('Mag deze gebruiker schrijven?') ? 'write' : 'read';
    const file = files.find(f => f._id === activeFileId);
    const sharedWith = [...(file.sharedWith || []), { email, permission: perm }];
    await axios.put(`/api/files/${activeFileId}`, { sharedWith }, { headers: { Authorization: `Bearer ${token}` } });
    fetchFiles();
    alert('Gedeeld!');
  };

  const deleteFile = async (id: string) => {
    if (!confirm('Zeker weten?')) return;
    await axios.delete(`/api/files/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (activeFileId === id) {
      setActiveFileId(null);
      setCode('');
    }
    fetchFiles();
  };

  const runCode = async () => {
    setOutput('Bezig met uitvoeren...');
    setPlot(null);
    try {
      const res = await axios.post('/api/execute', { code }, { headers: { Authorization: `Bearer ${token}` } });
      setOutput(res.data.stdout || res.data.stderr || res.data.error || 'Klaar.');
      if (res.data.plot) setPlot(`data:image/png;base64,${res.data.plot}`);
      setVariables(res.data.variables || {});
      setRightTab('vars');
    } catch (err) {
      setOutput('Fout bij uitvoeren van code.');
    }
  };

  const handleLoginSuccess = async (res: any) => {
    const { data } = await axios.post('/api/auth/google', { credential: res.credential });
    saveSession(data);
  };

  const handleMockLogin = async (email: string) => {
    const { data } = await axios.post('/api/auth/mock', { email });
    saveSession(data);
  };

  const saveSession = (data: any) => {
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  if (!user) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', width: '400px' }}>
          <h1>Irishof R Editor</h1>
          <button onClick={() => handleMockLogin('test@gemini.com')} style={{ width: '100%', padding: '12px', background: '#4a5568', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '15px', fontWeight: 'bold' }}>Login als test@gemini.com</button>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}><GoogleLogin onSuccess={handleLoginSuccess} /></GoogleOAuthProvider>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#1e1e1e', color: 'white' }}>
      <header style={{ height: '50px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #333', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ fontWeight: 'bold', color: '#3498db' }}>R Editor</span>
          <button onClick={runCode} className="btn-run"><Play size={14}/> Run</button>
          <button onClick={saveFile} className="btn-save"><Save size={14}/> {isSaving ? '...' : 'Save'}</button>
          {activeFileId && <button onClick={shareFile} className="btn-share"><Share2 size={14}/> Share</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {user.isAdmin && <button onClick={() => setShowAdmin(!showAdmin)} style={{ color: showAdmin ? '#3498db' : '#888', background: 'none', border: 'none', cursor: 'pointer' }} title="Beheer"><UserCog/></button>}
          <span style={{ fontSize: '13px' }}>{user.name}</span>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }} title="Uitloggen"><LogOut size={18}/></button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <aside style={{ width: '250px', background: '#252526', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2d2d2d' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#888' }}>{user.isAdmin ? 'ALLE BESTANDEN' : 'MIJN BESTANDEN'}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ cursor: 'pointer' }} onClick={uploadFile} title="Uploaden"><Upload size={14} /></div>
              <div style={{ cursor: 'pointer' }} onClick={createFile} title="Nieuw"><Plus size={16} /></div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {files.map(f => (
              <div key={f._id} onClick={() => openFile(f)} style={{ padding: '8px 15px', fontSize: '13px', cursor: 'pointer', background: activeFileId === f._id ? '#37373d' : 'transparent', borderBottom: '1px solid #222' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={14} color={f.owner?._id === user.id ? '#3498db' : '#f1c40f'}/>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  <Trash2 size={12} onClick={(e) => { e.stopPropagation(); deleteFile(f._id); }} style={{ color: '#555' }}/>
                </div>
                {user.isAdmin && <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>Eigenaar: {f.owner?.email}</div>}
              </div>
            ))}
          </div>
        </aside>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            <Editor height="100%" defaultLanguage="r" theme="vs-dark" value={code} onChange={(val) => { setCode(val || ''); if (activeFileId) socket.emit('edit-file', { fileId: activeFileId, content: val, userEmail: user.email }); }} options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }} />
          </div>
          <div style={{ height: '200px', background: '#000', padding: '10px', overflowY: 'auto', borderTop: '1px solid #333' }}>
            <pre style={{ margin: 0, color: '#2ecc71', fontSize: '13px', fontFamily: 'monospace' }}>{output}</pre>
          </div>
        </main>

        <aside style={{ width: '400px', background: '#fff', color: '#333', borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', background: '#f8f9fa', borderBottom: '1px solid #ddd' }}>
            <button onClick={() => setRightTab('files')} style={{ flex: 1, padding: '10px', border: 'none', background: rightTab === 'files' ? 'white' : 'transparent', fontSize: '11px', fontWeight: 'bold', borderBottom: rightTab === 'files' ? '2px solid #3498db' : 'none', cursor: 'pointer' }}>VISUALISATIE</button>
            <button onClick={() => setRightTab('vars')} style={{ flex: 1, padding: '10px', border: 'none', background: rightTab === 'vars' ? 'white' : 'transparent', fontSize: '11px', fontWeight: 'bold', borderBottom: rightTab === 'vars' ? '2px solid #3498db' : 'none', cursor: 'pointer' }}>VARIABELEN</button>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {rightTab === 'files' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                {plot ? <img src={plot} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="Plot" /> : <Layout size={48} color="#eee"/>}
              </div>
            ) : (
              <div style={{ padding: '15px' }}>
                {Object.keys(variables).length === 0 ? <div style={{ color: '#999', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Voer code uit om variabelen te zien.</div> : 
                  Object.entries(variables).map(([name, info]: [string, any]) => (
                    <div key={name} style={{ marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3498db', fontWeight: 'bold', fontSize: '13px' }}><Database size={12}/> {name}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>Type: {info.type}</div>
                      <pre style={{ margin: '5px 0 0 0', fontSize: '11px', background: '#f4f4f4', padding: '5px', borderRadius: '4px', overflowX: 'auto' }}>{info.summary}</pre>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </aside>
      </div>

      {showAdmin && (
        <div style={{ position: 'fixed', inset: '50px 0 0 0', background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
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
        .btn-run { background: #2ecc71; border: none; padding: 6px 15px; border-radius: 4px; color: white; cursor: pointer; display: flex; alignItems: center; gap: 8px; font-weight: bold; font-size: 13px; }
        .btn-save { background: #34495e; border: none; padding: 6px 15px; border-radius: 4px; color: white; cursor: pointer; display: flex; alignItems: center; gap: 8px; font-size: 13px; }
        .btn-share { background: #3498db; border: none; padding: 6px 15px; border-radius: 4px; color: white; cursor: pointer; display: flex; alignItems: center; gap: 8px; font-size: 13px; }
        .btn-run:hover { background: #27ae60; }
        .btn-save:hover { background: #2c3e50; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
}

export default App;
