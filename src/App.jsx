import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  EMAIL_SETTINGS_DEFAULTS,
  USER_PROFILE_DEFAULTS,
  buildUserMarkdown,
  getDefaultEmailMarkdown,
  parseUserMarkdown,
} from './wizard/defaults';

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
  return [...stepEntries].sort((leftEntry, rightEntry) => {
    const leftOrder = Number(leftEntry?.order || Number.MAX_SAFE_INTEGER);
    const rightOrder = Number(rightEntry?.order || Number.MAX_SAFE_INTEGER);

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return leftEntry.id.localeCompare(rightEntry.id);
  });
}

async function loadWizardSteps() {
  const modules = await Promise.all(
    Object.entries(wizardStepLoaders).map(async ([stepPath, loadModule]) => {
      const module = await loadModule();

      if (!module?.wizardStep?.Component) {
        throw new Error(`Wizard step "${stepPath}" is invalid.`);
      }

      return {
        id: stepPath.split('/').at(-1)?.replace(/\.[^.]+$/, '') || stepPath,
        ...module.wizardStep,
      };
    }),
  );

  return orderWizardSteps(modules);
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
    userMarkdown: buildUserMarkdown(USER_PROFILE_DEFAULTS),
    userFullName: USER_PROFILE_DEFAULTS.fullName,
    userSex: USER_PROFILE_DEFAULTS.sex,
    userBirthday: USER_PROFILE_DEFAULTS.birthday,
    userLanguage: USER_PROFILE_DEFAULTS.language,
    userCountry: USER_PROFILE_DEFAULTS.country,
    userCity: USER_PROFILE_DEFAULTS.city,
    userFamily: USER_PROFILE_DEFAULTS.family,
    userAnimals: USER_PROFILE_DEFAULTS.animals,
    userInterests: USER_PROFILE_DEFAULTS.interests,
    userRules: USER_PROFILE_DEFAULTS.rules,
    userNotes: USER_PROFILE_DEFAULTS.notes,
    emailMarkdown: '',
    openApiBaseUrl: '',
    emailImapHost: EMAIL_SETTINGS_DEFAULTS.emailImapHost,
    emailImapPort: EMAIL_SETTINGS_DEFAULTS.emailImapPort,
    emailImapSecure: EMAIL_SETTINGS_DEFAULTS.emailImapSecure,
    emailImapUser: '',
    emailImapPassword: '',
    emailSmtpHost: EMAIL_SETTINGS_DEFAULTS.emailSmtpHost,
    emailSmtpPort: EMAIL_SETTINGS_DEFAULTS.emailSmtpPort,
    emailSmtpSecure: EMAIL_SETTINGS_DEFAULTS.emailSmtpSecure,
    emailSmtpUser: '',
    emailSmtpPassword: '',
    telegramToken: '',
  });
  const conversationRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      window.appControls.getIdentity(),
      window.appControls.getSetupState(),
      window.appControls.getConversationHistory(),
      loadWizardSteps(),
    ])
      .then(([identity, setupState, storedConversation, steps]) => {
        if (!isMounted) {
          return;
        }

        const nextAssistantName = identity?.name?.trim() || DEFAULT_ASSISTANT_NAME;
        const normalizedStoredConversation = Array.isArray(storedConversation)
          ? storedConversation
          : [];
        const localConversation = loadConversation();
        const userProfile = parseUserMarkdown(setupState?.userMarkdown || '');
        const userMarkdown = buildUserMarkdown(userProfile);
        const emailMarkdown =
          setupState?.emailMarkdown || getDefaultEmailMarkdown(userProfile.fullName);

        setAssistantName(nextAssistantName);
        setIsFirstLaunch(Boolean(setupState?.isFirstLaunch));
        setFormData({
          identityMarkdown: setupState?.identityMarkdown || '',
          userMarkdown,
          userFullName: userProfile.fullName,
          userSex: userProfile.sex,
          userBirthday: userProfile.birthday,
          userLanguage: userProfile.language,
          userCountry: userProfile.country,
          userCity: userProfile.city,
          userFamily: userProfile.family,
          userAnimals: userProfile.animals,
          userInterests: userProfile.interests,
          userRules: userProfile.rules,
          userNotes: userProfile.notes,
          emailMarkdown,
          openApiBaseUrl: setupState?.openApiBaseUrl || '',
          emailImapHost:
            setupState?.emailImapHost || EMAIL_SETTINGS_DEFAULTS.emailImapHost,
          emailImapPort:
            setupState?.emailImapPort || EMAIL_SETTINGS_DEFAULTS.emailImapPort,
          emailImapSecure:
            setupState?.emailImapSecure || EMAIL_SETTINGS_DEFAULTS.emailImapSecure,
          emailImapUser: setupState?.emailImapUser || '',
          emailImapPassword: setupState?.emailImapPassword || '',
          emailSmtpHost:
            setupState?.emailSmtpHost || EMAIL_SETTINGS_DEFAULTS.emailSmtpHost,
          emailSmtpPort:
            setupState?.emailSmtpPort || EMAIL_SETTINGS_DEFAULTS.emailSmtpPort,
          emailSmtpSecure:
            setupState?.emailSmtpSecure || EMAIL_SETTINGS_DEFAULTS.emailSmtpSecure,
          emailSmtpUser: setupState?.emailSmtpUser || setupState?.emailImapUser || '',
          emailSmtpPassword:
            setupState?.emailSmtpPassword || setupState?.emailImapPassword || '',
          telegramToken: setupState?.telegramToken || '',
        });
        setConversation(
          normalizedStoredConversation.length
            ? normalizedStoredConversation
            : localConversation,
        );
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
    persistConversation(conversation);
    window.appControls.syncConversationHistory(conversation).catch(() => {});
  }, [conversation]);

  useEffect(() => {
    document.title = `${assistantName} Operating System`;
  }, [assistantName]);

  const visibleWizardSteps = wizardSteps.filter((step) =>
    typeof step?.isVisible === 'function' ? step.isVisible(formData) : true,
  );

  useEffect(() => {
    setWizardStepIndex((currentIndex) => {
      if (!visibleWizardSteps.length) {
        return 0;
      }

      return Math.min(currentIndex, visibleWizardSteps.length - 1);
    });
  }, [visibleWizardSteps.length]);

  useEffect(() => {
    const unsubscribe = window.appControls.onConversationMessage((entry) => {
      const content = entry?.content?.trim();

      if (!content) {
        return;
      }

      const nextEntry = {
        role: entry?.role === 'user' ? 'user' : 'assistant',
        content,
        ...(typeof entry?.createdAt === 'string' && entry.createdAt.trim()
          ? { createdAt: entry.createdAt }
          : {}),
        ...(typeof entry?.chatId === 'string' && entry.chatId.trim()
          ? { chatId: entry.chatId.trim() }
          : typeof entry?.chatId === 'number'
            ? { chatId: entry.chatId }
            : {}),
        ...(entry?.source === 'telegram' ? { source: 'telegram' } : {}),
      };

      setConversation((currentConversation) => {
        return appendConversationEntry(currentConversation, nextEntry);
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
    } catch (error) {
      const details =
        error instanceof Error ? error.message : 'Cannot receive reply.';
      const failedConversation = appendConversationEntry(nextConversation.slice(0, -1), {
        role: 'assistant',
        content: `Error: ${details}`,
      });

      setConversation(failedConversation);
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
  };

  const handleMessageKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    handleSubmit();
  };

  const handleWizardFieldChange = (field, value) => {
    setFormData((currentFormData) => {
      const nextFormData = {
        ...currentFormData,
        [field]: value,
      };

      if (field === 'userFullName') {
        const currentEmailMarkdown = String(currentFormData.emailMarkdown || '').trim();
        const currentDefaultEmailMarkdown = getDefaultEmailMarkdown(
          currentFormData.userFullName,
        );

        if (!currentEmailMarkdown || currentEmailMarkdown === currentDefaultEmailMarkdown) {
          nextFormData.emailMarkdown = getDefaultEmailMarkdown(value);
        }
      }

      return nextFormData;
    });
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
    const currentStep = visibleWizardSteps[wizardStepIndex];

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

      if (wizardStepIndex < visibleWizardSteps.length - 1) {
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

  const handleWizardSkipEmail = async () => {
    if (isWizardSaving) {
      return;
    }

    setIsWizardSaving(true);
    setWizardError('');

    try {
      await window.appControls.saveEmailSettings({
        EMAIL_IMAP_HOST: '',
        EMAIL_IMAP_PORT: '',
        EMAIL_IMAP_SECURE: '',
        EMAIL_IMAP_USER: '',
        EMAIL_IMAP_PASSWORD: '',
        EMAIL_SMTP_HOST: '',
        EMAIL_SMTP_PORT: '',
        EMAIL_SMTP_SECURE: '',
        EMAIL_SMTP_USER: '',
        EMAIL_SMTP_PASSWORD: '',
      });
      await window.appControls.saveEmailMarkdown('');

      setFormData((currentFormData) => ({
        ...currentFormData,
        emailImapHost: EMAIL_SETTINGS_DEFAULTS.emailImapHost,
        emailImapPort: EMAIL_SETTINGS_DEFAULTS.emailImapPort,
        emailImapSecure: EMAIL_SETTINGS_DEFAULTS.emailImapSecure,
        emailImapUser: '',
        emailImapPassword: '',
        emailSmtpHost: EMAIL_SETTINGS_DEFAULTS.emailSmtpHost,
        emailSmtpPort: EMAIL_SETTINGS_DEFAULTS.emailSmtpPort,
        emailSmtpSecure: EMAIL_SETTINGS_DEFAULTS.emailSmtpSecure,
        emailSmtpUser: '',
        emailSmtpPassword: '',
        emailMarkdown: '',
      }));

      setWizardStepIndex((currentIndex) =>
        Math.min(currentIndex + 1, Math.max(visibleWizardSteps.length - 1, 0)),
      );
    } catch (error) {
      setWizardError(
        error instanceof Error ? error.message : 'Cannot skip email setup.',
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
    const currentStep = visibleWizardSteps[wizardStepIndex];
    const StepComponent = currentStep?.Component;

    return (
      <main className="app">
        <section className="card wizard-card">
          <div className="wizard-header">
            <h1>Application setup wizard</h1>
            <p className="wizard-progress">
              Step {wizardStepIndex + 1} of {visibleWizardSteps.length || 1}
            </p>
          </div>
          {StepComponent ? (
            <StepComponent
              formData={formData}
              onChange={handleWizardFieldChange}
              onSkipEmail={handleWizardSkipEmail}
              isWizardSaving={isWizardSaving}
            />
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
                : wizardStepIndex === visibleWizardSteps.length - 1
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
