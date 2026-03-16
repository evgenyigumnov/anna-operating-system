import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'anna-conversation-history';

function App() {
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState(() => {
    try {
      const savedConversation = window.localStorage.getItem(STORAGE_KEY);

      if (!savedConversation) {
        return [];
      }

      const parsedConversation = JSON.parse(savedConversation);
      return Array.isArray(parsedConversation) ? parsedConversation : [];
    } catch (_error) {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const conversationRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
  }, [conversation]);

  useEffect(() => {
    if (!conversationRef.current) {
      return;
    }

    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [conversation, isLoading]);

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isLoading) {
      return;
    }

    setIsLoading(true);
    setMessage('');

    const nextConversation = [
      ...conversation,
      { role: 'user', content: trimmedMessage },
    ];

    setConversation(nextConversation);

    try {
      const reply = await window.appControls.infer(nextConversation);
      setConversation([
        ...nextConversation,
        { role: 'assistant', content: reply },
      ]);
    } catch (error) {
      const details =
        error instanceof Error ? error.message : 'Не удалось получить ответ.';
      setConversation([
        ...nextConversation,
        { role: 'assistant', content: `Ошибка: ${details}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearConversation = () => {
    if (isLoading) {
      return;
    }

    setConversation([]);
    setMessage('');
    window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <main className="app">
      <section className="card">
        <h1>Здравствуйте, пользователь</h1>
        <div className="conversation" ref={conversationRef}>
          {conversation.length ? (
            conversation.map((entry, index) => (
              <p
                key={`${entry.role}-${index}`}
                className={`conversation-line conversation-line--${entry.role}`}
              >
                <span className="conversation-author">
                  {entry.role === 'user' ? 'Вы' : 'Anna'}:
                </span>{' '}
                {entry.content}
              </p>
            ))
          ) : (
            <p className="conversation-placeholder">История переписки пока пуста.</p>
          )}
        </div>
        <textarea
          className="message-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Введите сообщение для Anna"
          rows="4"
        />
        <div className="actions">
          <button type="button" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Отправка...' : 'Отправить'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleClearConversation}
            disabled={isLoading || (!conversation.length && !message)}
          >
            Очистить
          </button>
        </div>
      </section>
    </main>
  );
}

export default App;
