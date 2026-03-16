import { useState } from 'react';

function App() {
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      const reply = await window.appControls.infer(trimmedMessage);
      setConversation(`Вы: ${trimmedMessage}\nAnna: ${reply}`);
    } catch (error) {
      const details =
        error instanceof Error ? error.message : 'Не удалось получить ответ.';
      setConversation(`Вы: ${trimmedMessage}\nAnna: Ошибка: ${details}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuit = async () => {
    await window.appControls.quit();
  };

  return (
    <main className="app">
      <section className="card">
        <h1>Здравствуйте, пользователь</h1>
        <p className="conversation">{conversation || 'Вы: \nAnna: '}</p>
        <textarea
          className="message-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Введите сообщение для Anna"
          rows="4"
        />
        <button type="button" onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? 'Отправка...' : 'Отправить'}
        </button>
        <button type="button" className="secondary-button" onClick={handleQuit}>
          Выйти из приложения
        </button>
      </section>
    </main>
  );
}

export default App;
