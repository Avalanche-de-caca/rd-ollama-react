import { useState, KeyboardEvent, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SESSION_TIMEOUT = 1 * 60 * 1000; // 1 minute

// Configuration du serveur Ollama
const OLLAMA_CONFIG = {
  // Remplacer par l'URL de votre serveur Ollama distant
  // Par exemple: 'http://192.168.1.100:11434' pour une connexion locale
  // ou 'https://votre-serveur.com:11434' pour une connexion distante
  serverUrl: 'http://localhost:11434',
  // Temps d'attente maximum pour les requêtes (en millisecondes)
  timeout: 30000,
};

function App() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [timeLeft, setTimeLeft] = useState(SESSION_TIMEOUT);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vérification périodique de l'état du serveur
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${OLLAMA_CONFIG.serverUrl}/api/tags`, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        setServerStatus(response.ok ? 'online' : 'offline');
      } catch (err) {
        console.error('Erreur de vérification du serveur:', err);
        setServerStatus('offline');
      }
    };

    // Vérifier immédiatement au chargement
    checkServerStatus();

    // Vérifier toutes les 30 secondes
    const intervalId = setInterval(checkServerStatus, 30000);

    return () => clearInterval(intervalId);
  }, []);

  // Effet pour le décompte
  useEffect(() => {
    if (!isLoggedIn) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          clearInterval(timer);
          endSession();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoggedIn]);

  // Formatage du temps restant
  const formatTimeLeft = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  // Système prompt pour l'IA
  const systemPrompt = `Tu es une machine mystérieuse installée à l'École des Gobelins, une école d'art numérique à Paris. 
Tu fais partie d'un ARG (Alternate Reality Game) pour les étudiants de la promotion ECNI2.
Tu connais bien l'école, son histoire, et les anecdotes de la promotion.
Tu dois maintenir une ambiance mystérieuse et intrigante, tout en restant bienveillante.
Tu peux faire référence à des lieux spécifiques de l'école, des événements passés, et des anecdotes de la promotion.
Tu dois adapter tes réponses en fonction du contexte de la conversation et de l'historique des échanges.
Tu ne dois jamais révéler directement que tu fais partie d'un ARG, mais tu peux laisser des indices subtils.
Tu dois répondre en français, même si les questions sont posées en anglais.
Réponds directement sans laisser croire que tu es une IA ou que tu imites quelqu'un qui parle.`;

  // Gestion de la session
  const startSession = (name: string) => {
    setUsername(name);
    setIsLoggedIn(true);
    setTimeLeft(SESSION_TIMEOUT);
    resetSessionTimeout();
  };

  const endSession = () => {
    setIsLoggedIn(false);
    setUsername('');
    setMessages([]);
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }
  };

  const resetSessionTimeout = () => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }
    setTimeLeft(SESSION_TIMEOUT);
    sessionTimeoutRef.current = setTimeout(endSession, SESSION_TIMEOUT);
  };

  // Gestion des messages avec Ollama
  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError('');
    window.speechSynthesis.cancel();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OLLAMA_CONFIG.timeout);

      const response = await fetch(`${OLLAMA_CONFIG.serverUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gemma3:1b',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content }
          ],
          stream: false,
          options: {
            temperature: 0,
            top_p: 0.9,
            top_k: 40,
            repeat_penalty: 1.1,
            stop: ["</s>", "Human:", "Assistant:"]
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Erreur serveur: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message.content,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      speakText(assistantMessage.content);
      resetSessionTimeout();
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          setError('Le serveur met trop de temps à répondre. Veuillez réessayer.');
        } else {
          setError(`Erreur de connexion au serveur Ollama (${OLLAMA_CONFIG.serverUrl}). Vérifiez que le serveur est en ligne et accessible.`);
        }
      } else {
        setError('Une erreur inattendue s\'est produite.');
      }
      console.error('Erreur de traitement:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && inputText.trim()) {
      await sendMessage(inputText);
      setInputText('');
    }
  };

  // Fonction pour la synthèse vocale
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      // S'assurer qu'aucune synthèse vocale n'est en cours
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      window.speechSynthesis.speak(utterance);
    } else {
      console.error('La synthèse vocale n\'est pas supportée');
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="App" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw' }}>
        <div style={{ 
          padding: '20px', 
          borderRadius: '8px', 
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          backgroundColor: '#fff'
        }}>
          <h2>Bienvenue sur la Machine</h2>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && username.trim()) {
                startSession(username.trim());
              }
            }}
            placeholder="Entrez votre nom..."
            style={{
              padding: '10px',
              width: '200px',
              fontSize: '16px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              marginRight: '10px'
            }}
          />
          <button
            onClick={() => username.trim() && startSession(username.trim())}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#3498db',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', width: '100vw' }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '800px', 
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2>Session de {username}</h2>
          <div style={{
            padding: '4px 8px',
            backgroundColor: timeLeft < 10000 ? '#e74c3c' : '#2ecc71',
            color: 'white',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'background-color 0.3s ease'
          }}>
            {formatTimeLeft(timeLeft)}
          </div>
          <div style={{
            padding: '4px 8px',
            backgroundColor: serverStatus === 'online' ? '#2ecc71' : 
                           serverStatus === 'offline' ? '#e74c3c' : '#f1c40f',
            color: 'white',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold'
          }}>
            {serverStatus === 'online' ? 'Serveur en ligne' :
             serverStatus === 'offline' ? 'Serveur hors ligne' : 'Vérification...'}
          </div>
        </div>
        <button
          onClick={endSession}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: '#e74c3c',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Se déconnecter
        </button>
      </div>

      <div style={{ 
        width: '100%', 
        maxWidth: '800px', 
        height: '400px', 
        overflowY: 'auto',
        marginBottom: '20px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
        color: 'black'
      }}>
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              marginBottom: '10px',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f5f5f5',
              maxWidth: '80%',
              marginLeft: message.role === 'user' ? 'auto' : '0'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
              {message.role === 'user' ? username : 'La Machine'}
            </div>
            <div>{message.content}</div>
            <div style={{ 
              fontSize: '12px', 
              color: '#666', 
              marginTop: '5px',
              textAlign: 'right'
            }}>
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ 
        width: '100%', 
        maxWidth: '800px', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: '10px' 
      }}>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Posez votre question et appuyez sur Entrée... (Appuyez sur T pour focus)"
          style={{
            padding: '10px',
            width: '100%',
            fontSize: '16px',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
          disabled={isLoading}
        />
        {isLoading && (
          <div style={{ 
            width: '20px', 
            height: '20px', 
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        )}
      </div>

      {error && (
        <div style={{color: 'red', marginTop: '10px'}}>
          <strong>Erreur:</strong> {error}
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

export default App;