import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const STORAGE_KEY = 'assistant-conversation-history';
const DEFAULT_ASSISTANT_NAME = 'Анна';
const wizardStepLoaders = import.meta.glob('./wizard/steps/*.jsx');

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

function orderWizardSteps(stepEntries) {
  return [...stepEntries].sort(([leftPath], [rightPath]) =>
    leftPath.localeCompare(rightPath),
  );
}

async function loadWizardSteps() {
  const modules = await Promise.all(
    orderWizardSteps(Object.entries(wizardStepLoaders)).map(
      async ([stepPath, loadModule]) => {
        const module = await loadModule();

        if (!module?.wizardStep?.Component) {
          throw new Error(`Wizard step "${stepPath}" is invalid.`);
        }

        return {
          id: stepPath.split('/').at(-1)?.replace(/\.[^.]+$/, '') || stepPath,
          ...module.wizardStep,
        };
      },
    ),
  );

  return modules;
}

const ChatScreen = lazy(() =>
  Promise.resolve({
    default: function ChatScreen({
      assistantName,
      conversation,
      conversationRef,
      handleClearConversation,
      handleMessageKeyDown,
      handleSubmit,
      isLoading,
      message,
      setMessage,
    }) {
      return (
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
      );
    },
  }),
);

function App() {
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState(loadConversation);
  const [isLoading, setIsLoading] = useState(false);
  const [assistantName, setAssistantName] = useState(DEFAULT_ASSISTANT_NAME);
  const [wizardSteps, setWizardSteps] = useState([]);
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [wizardError, setWizardError] = useState('');
  const [isWizardReady, setIsWizardReady] = useState(false);
  const [isWizardSaving, setIsWizardSaving] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [formData, setFormData] = useState({
    identityMarkdown: '',
    openApiBaseUrl: '',
  });
  const conversationRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([window.appControls.getIdentity(), window.appControls.getSetupState(), loadWizardSteps()])
      .then(([identity, setupState, steps]) => {
        if (!isMounted) {
          return;
        }

        const nextAssistantName = identity?.name?.trim() || DEFAULT_ASSISTANT_NAME;
        setAssistantName(nextAssistantName);
        setIsFirstLaunch(Boolean(setupState?.isFirstLaunch));
        setFormData({
          identityMarkdown: setupState?.identityMarkdown || '',
          openApiBaseUrl: setupState?.openApiBaseUrl || '',
        });
        setWizardSteps(steps);
        setIsWizardReady(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setAssistantName(DEFAULT_ASSISTANT_NAME);
        setWizardError('Cannot load application setup.');
        setIsFirstLaunch(true);
        setIsWizardReady(true);
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

  const handleWizardFieldChange = (field, value) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      [field]: value,
    }));
    setWizardError('');
  };

  const handleWizardBack = () => {
    if (isWizardSaving) {
      return;
    }

    setWizardError('');
    setWizardStepIndex((currentIndex) => Math.max(currentIndex - 1, 0));
  };

  const handleWizardNext = async () => {
    const currentStep = wizardSteps[wizardStepIndex];

    if (!currentStep || isWizardSaving) {
      return;
    }

    const validationError =
      typeof currentStep.validate === 'function' ? currentStep.validate(formData) : '';

    if (validationError) {
      setWizardError(validationError);
      return;
    }

    setIsWizardSaving(true);
    setWizardError('');

    try {
      if (typeof currentStep.persist === 'function') {
        await currentStep.persist(formData);
      }

      if (wizardStepIndex < wizardSteps.length - 1) {
        setWizardStepIndex((currentIndex) => currentIndex + 1);
      } else {
        await window.appControls.completeSetup();
        const identity = await window.appControls.getIdentity();
        setAssistantName(identity?.name?.trim() || DEFAULT_ASSISTANT_NAME);
        setIsFirstLaunch(false);
      }
    } catch (error) {
      setWizardError(
        error instanceof Error ? error.message : 'Cannot save setup step.',
      );
    } finally {
      setIsWizardSaving(false);
    }
  };

  if (!isWizardReady) {
    return (
      <main className="app">
        <section className="card card--compact">
          <h1>Loading...</h1>
        </section>
      </main>
    );
  }

  if (isFirstLaunch) {
    const currentStep = wizardSteps[wizardStepIndex];
    const StepComponent = currentStep?.Component;

    return (
      <main className="app">
        <section className="card wizard-card">
          <div className="wizard-header">
            <h1>Application setup wizard</h1>
            <p className="wizard-progress">
              Step {wizardStepIndex + 1} of {wizardSteps.length || 1}
            </p>
          </div>
          {StepComponent ? (
            <StepComponent formData={formData} onChange={handleWizardFieldChange} />
          ) : (
            <p className="conversation-placeholder">No setup steps were found.</p>
          )}
          {wizardError ? <p className="wizard-error">{wizardError}</p> : null}
          <div className="actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleWizardBack}
              disabled={wizardStepIndex === 0 || isWizardSaving}
            >
              Back
            </button>
            <button type="button" onClick={handleWizardNext} disabled={isWizardSaving}>
              {isWizardSaving
                ? 'Saving...'
                : wizardStepIndex === wizardSteps.length - 1
                  ? 'Finish'
                  : 'Next'}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <Suspense
        fallback={
          <section className="card card--compact">
            <h1>Loading...</h1>
          </section>
        }
      >
        <ChatScreen
          assistantName={assistantName}
          conversation={conversation}
          conversationRef={conversationRef}
          handleClearConversation={handleClearConversation}
          handleMessageKeyDown={handleMessageKeyDown}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          message={message}
          setMessage={setMessage}
        />
      </Suspense>
    </main>
  );
}

export default App;
