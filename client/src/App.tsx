import { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import Editor from '@monaco-editor/react';
import { Play, Save, FileText, Layout, LogOut } from 'lucide-react';
import axios from 'axios';

const GOOGLE_CLIENT_ID = '339058057860-i6ne31mqs27mqm2ulac7al9vi26pmgo1.apps.googleusercontent.com';

function App() {
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [code, setCode] = useState('# Welkom bij de simpele R Editor\nprint("Hallo Irishof!")\n\n# Probeer een plot\nplot(rnorm(100), col="blue", pch=19, main="Random Normal Distribution")');
  const [output, setOutput] = useState('');
  const [plot, setPlot] = useState<string | null>(null);
  const [files, setFiles] = useState([]);

  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [token]);

  const fetchFiles = async () => {
    try {
      const res = await axios.get('/api/files', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(res.data);
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const handleLoginSuccess = async (credentialResponse: any) => {
    try {
      const res = await axios.post('/api/auth/google', { credential: credentialResponse.credential });
      saveSession(res.data);
    } catch (err) {
      alert('Login mislukt');
    }
  };

  const handleMockLogin = async (email: string) => {
    try {
      const res = await axios.post('/api/auth/mock', { email });
      saveSession(res.data);
    } catch (err) {
      alert('Mock login mislukt');
    }
  };

  const saveSession = (data: any) => {
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setToken(null);
    setFiles([]);
  };

  const runCode = async () => {
    setOutput('Bezig met uitvoeren...');
    setPlot(null);
    try {
      const res = await axios.post('/api/execute', { code }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOutput(res.data.stdout || res.data.stderr || res.data.error || 'Klaar.');
      if (res.data.plot) {
        setPlot(`data:image/png;base64,${res.data.plot}`);
      }
    } catch (err) {
      setOutput('Fout bij uitvoeren van code');
    }
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f0f2f5' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center', width: '400px' }}>
          <h1 style={{ marginBottom: '10px', color: '#1a2a3a' }}>Irishof R Editor</h1>
          <p style={{ color: '#666', marginBottom: '30px' }}>Log in om te beginnen</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Mock Login prominent bovenaan zolang Google niet werkt op het domein */}
            <button 
              onClick={() => handleMockLogin('test@gemini')} 
              style={{ padding: '12px', background: '#4a5568', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
            >
              Direct inloggen (Test User)
            </button>

            <div style={{ margin: '10px 0', borderBottom: '1px solid #eee', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: '0 10px', color: '#999', fontSize: '12px' }}>OF</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                <GoogleLogin onSuccess={handleLoginSuccess} />
              </GoogleOAuthProvider>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1e1e1e', color: 'white' }}>
      {/* Navbar */}
      <header style={{ height: '50px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #333', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#3498db' }}>R Editor</span>
          <button onClick={runCode} style={{ background: '#2ecc71', color: 'white', border: 'none', padding: '6px 15px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            <Play size={16} /> Run
          </button>
          <button style={{ background: '#34495e', color: 'white', border: 'none', padding: '6px 15px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <Save size={16} /> Save
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {user.isAdmin && <span style={{ background: '#e74c3c', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>ADMIN</span>}
          <span style={{ fontSize: '14px', color: '#ccc' }}>{user.name}</span>
          <img src={user.picture || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'} style={{ width: '30px', height: '32px', borderRadius: '50%', border: '1px solid #555' }} alt="profile" />
          <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Uitloggen">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Code + Console */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', borderRight: '1px solid #333' }}>
          <div style={{ flex: 1 }}>
            <Editor
              height="100%"
              defaultLanguage="r"
              theme="vs-dark"
              value={code}
              onChange={(value: any) => setCode(value || '')}
              options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: 'on' }}
            />
          </div>
          <div style={{ height: '200px', background: '#000', padding: '15px', overflowY: 'auto', borderTop: '1px solid #333' }}>
            <div style={{ color: '#666', fontSize: '11px', fontWeight: 'bold', marginBottom: '5px', letterSpacing: '1px' }}>CONSOLE</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#2ecc71', fontFamily: 'monospace', fontSize: '13px' }}>{output}</pre>
          </div>
        </div>

        {/* Right: Files/Vars + Plots */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, borderBottom: '1px solid #333', padding: '15px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#888', fontSize: '12px', fontWeight: 'bold' }}>
              <FileText size={14} /> <span>BESTANDEN</span>
            </div>
            <div style={{ fontSize: '13px' }}>
              {files.length === 0 ? <span style={{ color: '#555' }}>Geen bestanden.</span> : files.map((f: any) => (
                <div key={f._id} style={{ padding: '8px', borderBottom: '1px solid #222', cursor: 'pointer', color: '#bbb' }}>
                  {f.name}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1.5, padding: '15px', background: '#fff', color: '#333', display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#999', fontSize: '11px', fontWeight: 'bold', marginBottom: '10px' }}>VISUALISATIE (PLOT)</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #eee', borderRadius: '8px', overflow: 'hidden' }}>
              {plot ? (
                <img src={plot} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="R Plot" />
              ) : (
                <div style={{ textAlign: 'center', color: '#ccc' }}>
                  <Layout size={40} strokeWidth={1} />
                  <p style={{ fontSize: '12px', marginTop: '10px' }}>Nog geen plot gegenereerd</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
