import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import Editor from '@monaco-editor/react';
import { Play, Save, Share2, Users, FileText, Layout, Settings } from 'lucide-react';
import io from 'socket.io-client';
import axios from 'axios';

const GOOGLE_CLIENT_ID = '339058057860-i6ne31mqs27mqm2ulac7al9vi26pmgo1.apps.googleusercontent.com';
const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001');

function App() {
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [code, setCode] = useState('# Welkom bij de simpele R Editor\nprint("Hallo Irishof!")\n\n# Probeer een plot\n# plot(rnorm(100))');
  const [output, setOutput] = useState('');
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveTab] = useState<any>(null);

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
    }
  };

  const handleLoginSuccess = async (credentialResponse: any) => {
    try {
      const res = await axios.post('/api/auth/google', { credential: credentialResponse.credential });
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    } catch (err) {
      alert('Login mislukt');
    }
  };

  const runCode = async () => {
    setOutput('Bezig met uitvoeren...');
    try {
      const res = await axios.post('/api/execute', { code }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOutput(res.data.stdout || res.data.stderr || res.data.error || 'Geen output');
    } catch (err) {
      setOutput('Fout bij uitvoeren van code');
    }
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f7' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <h1 style={{ marginBottom: '10px' }}>Irishof R Editor</h1>
          <p style={{ color: '#666', marginBottom: '30px' }}>Log in met je schoolaccount om te beginnen</p>
          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <GoogleLogin onSuccess={handleLoginSuccess} />
          </GoogleOAuthProvider>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1e1e1e', color: 'white' }}>
      {/* Navbar */}
      <header style={{ height: '50px', background: '#2d2d2d', display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #333', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>R Editor</span>
          <button onClick={runCode} style={{ background: '#2ecc71', color: 'white', border: 'none', padding: '6px 15px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <Play size={16} /> Run
          </button>
          <button style={{ background: '#34495e', color: 'white', border: 'none', padding: '6px 15px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <Save size={16} /> Save
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {user.isAdmin && <span style={{ background: '#e74c3c', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>Admin</span>}
          <span>{user.name}</span>
          <img src={user.picture} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
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
              onChange={(value) => setCode(value || '')}
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>
          <div style={{ height: '250px', background: '#000', padding: '15px', overflowY: 'auto', borderTop: '1px solid #333' }}>
            <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>CONSOLE</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#2ecc71' }}>{output}</pre>
          </div>
        </div>

        {/* Right: Files/Vars + Plots */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, borderBottom: '1px solid #333', padding: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#aaa' }}>
              <FileText size={16} /> <span>FILES & VARIABLES</span>
            </div>
            <div style={{ fontSize: '14px' }}>
              {files.length === 0 ? 'Geen bestanden gevonden.' : files.map((f: any) => (
                <div key={f._id} style={{ padding: '8px', borderBottom: '1px solid #333', cursor: 'pointer' }}>
                  {f.name}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, padding: '15px', background: '#fff', color: '#333' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '10px' }}>PLOTS</div>
            <div style={{ textAlign: 'center', marginTop: '40px' }}>
              <Layout size={48} color="#ddd" />
              <p style={{ color: '#999' }}>Genereer een plot in R om hier te bekijken</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
