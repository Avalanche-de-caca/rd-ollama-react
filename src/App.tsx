import { useState } from 'react';

function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState('');

  // Fonction pour générer une réponse via fetch
  const generateLocalOllamaResponse = async (prompt: string) => {
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gemma3:1b',
          prompt: prompt,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.response || 'Pas de réponse générée';

    } catch (error) {
      console.error('Erreur Ollama:', error);
      throw error; // Relancer pour gérer dans le appelant
    }
  };

  // Fonction pour initialiser la reconnaissance vocale
  const startSpeechRecognition = () => {
    // Réinitialiser les erreurs précédentes
    setError('');

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      console.log('Reconnaissance vocale supportée');
      
      // @ts-expect-error any
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;  
      const recognition = new SpeechRecognition();
      
      
      recognition.lang = 'fr-FR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        console.log('Écoute en cours...');
      };
    
      // @ts-expect-error any
      recognition.onresult = async (event) => {
        const speechResult: string = event.results[0][0].transcript;
        setTranscript(speechResult);
        console.log('Transcription:', speechResult);

        try {
          const aiText: string = await generateLocalOllamaResponse(speechResult);
          setAiResponse(aiText);
          console.log('Réponse IA:', aiText);

          // Synthèse vocale
          speakText(aiText);
        } catch (error: unknown) {
          setError('Impossible de contacter le serveur Ollama. Vérifiez qu\'il est en cours d\'exécution.');
          console.error('Erreur de traitement:', error);
        }
      };

      // @ts-expect-error any
      recognition.onerror = (event) => {
        console.error('Erreur de reconnaissance vocale:', event.error);
        setError(`Erreur de reconnaissance vocale: ${event.error}`);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } else {
      setError('La reconnaissance vocale n\'est pas supportée par votre navigateur.');
    }
  };

  // Fonction pour la synthèse vocale
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      window.speechSynthesis.speak(utterance);
    } else {
      console.error('La synthèse vocale n\'est pas supportée');
    }
  };

  return (
    <div className="App">
      <button 
        onClick={startSpeechRecognition} 
        disabled={isListening}
      >
        {isListening ? 'Écoute en cours...' : 'Commencer à parler'}
      </button>
      
      {error && (
        <div style={{color: 'red', marginTop: '10px'}}>
          <strong>Erreur:</strong> {error}
        </div>
      )}
      
      {transcript && (
        <div>
          <h3>Transcription:</h3>
          <p>{transcript}</p>
        </div>
      )}
      
      {aiResponse && (
        <div>
          <h3>Réponse de l'IA:</h3>
          <p>{aiResponse}</p>
        </div>
      )}
    </div>
  );
}

export default App;