import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// Classic controlled inputs: fails with naive `input.value = x` autofill.
function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setResult(`state: ${email} / ${password.length} chars`);
      }}
    >
      <h1>Log in (React)</h1>
      <input id="user" name="username" placeholder="Username" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input id="pass" type="password" name="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit" disabled={!email || !password}>Sign in</button>
      <output id="result">{result}</output>
    </form>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
