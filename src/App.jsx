import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const STORAGE_KEY = 'assistant-conversation-history';
const DEFAULT_ASSISTANT_NAME = 'Анна';

function appendConversationEntry(currentConversation, nextEntry) {
  return [...currentConversation, nextEntry];
}

function loadConversation() {
  try {
    const savedConversation = window.localStorage.getItem(STORAGE_KEY);

    if (!savedConversation) {
      return [];
    }

    const parsedConversation = JSON.parse(savedConversation);
    return Array.isArray(parsedConversation) ? parsedConversation : [];
  } catch (_error) {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function persistConversation(nextConversation) {
  if (!nextConversation.length) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConversation));
}

function App() {
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState(loadConversation);
  const [isLoading, setIsLoading] = useState(false);
  const [assistantName, setAssistantName] = useState(DEFAULT_ASSISTANT_NAME);
  const conversationRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    window.appControls
      .getIdentity()
      .then((identity) => {
        if (!isMounted) {
          return;
        }

        const nextAssistantName = identity?.name?.trim() || DEFAULT_ASSISTANT_NAME;
        setAssistantName(nextAssistantName);
      })
      .catch(() => {
        if (isMounted) {
          setAssistantName(DEFAULT_ASSISTANT_NAME);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    document.title = `${assistantName} Operating System`;
  }, [assistantName]);

  useEffect(() => {
    const unsubscribe = window.appControls.onTaskResult((taskResult) => {
      const output = taskResult?.output?.trim();
      const fileName = taskResult?.fileName?.trim();

      if (!output) {
        return;
      }

      const nextEntry = {
        role: 'assistant',
        content: fileName
          ? `Task result from \`${fileName}\`\n\n${output}`
          : output,
      };

      setConversation((currentConversation) => {
        const nextConversation = appendConversationEntry(currentConversation, nextEntry);
        persistConversation(nextConversation);
        return nextConversation;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

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
      { role: 'assistant', content: '' },
    ];

    setConversation(nextConversation);
    persistConversation(nextConversation.slice(0, -1));

    try {
      const reply = await window.appControls.inferStream(nextConversation.slice(0, -1), {
        onChunk(delta) {
          setConversation((currentConversation) => {
            const updatedConversation = [...currentConversation];
            const lastEntry = updatedConversation.at(-1);

            if (!lastEntry || lastEntry.role !== 'assistant') {
              return currentConversation;
            }

            updatedConversation[updatedConversation.length - 1] = {
              ...lastEntry,
              content: `${lastEntry.content}${delta}`,
            };

            return updatedConversation;
          });
        },
      });

      const completedConversation = appendConversationEntry(nextConversation.slice(0, -1), {
        role: 'assistant',
        content: reply,
      });

      setConversation(completedConversation);
      persistConversation(completedConversation);
    } catch (error) {
      const details =
        error instanceof Error ? error.message : 'Cannot receive reply.';
      const failedConversation = appendConversationEntry(nextConversation.slice(0, -1), {
        role: 'assistant',
        content: `Error: ${details}`,
      });

      setConversation(failedConversation);
      persistConversation(failedConversation);
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
    persistConversation([]);
  };

  const handleMessageKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    handleSubmit();
  };

  return (
    <main className="app">
      <section className="card">
        <h1>Hello, user</h1>
        <div className="conversation" ref={conversationRef}>
          {conversation.length ? (
            conversation.map((entry, index) => (
              <article
                key={`${entry.role}-${index}`}
                className={`conversation-line conversation-line--${entry.role}`}
              >
                <div className="conversation-author">
                  {entry.role === 'user' ? 'You' : assistantName}
                </div>
                <div className="conversation-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {entry.content}
                  </ReactMarkdown>
                </div>
              </article>
            ))
          ) : (
            <p className="conversation-placeholder">Message history is empty.</p>
          )}
        </div>
        <textarea
          className="message-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleMessageKeyDown}
          placeholder={`Enter message for ${assistantName}`}
          rows="4"
        />
        <div className="actions">
          <button type="button" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleClearConversation}
            disabled={isLoading || (!conversation.length && !message)}
          >
            Clear
          </button>
        </div>
      </section>
    </main>
  );
}

export default App;
