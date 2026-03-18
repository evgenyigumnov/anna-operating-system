import { EMAIL_SETTINGS_DEFAULTS } from '../defaults';

function isPositiveInteger(value) {
  if (!String(value || '').trim()) {
    return false;
  }

  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0;
}

function updateEmailSetting(formData, onChange, field, value) {
  onChange(field, value);

  if (
    field === 'emailImapUser' &&
    (!String(formData.emailSmtpUser || '').trim() ||
      String(formData.emailSmtpUser || '').trim() ===
        String(formData.emailImapUser || '').trim())
  ) {
    onChange('emailSmtpUser', value);
  }

  if (
    field === 'emailImapPassword' &&
    (!String(formData.emailSmtpPassword || '').trim() ||
      String(formData.emailSmtpPassword || '').trim() ===
        String(formData.emailImapPassword || '').trim())
  ) {
    onChange('emailSmtpPassword', value);
  }
}

function EmailSettingsStep({ formData, onChange, onSkipEmail, isWizardSaving }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure email settings in `.env`</h2>
        <p>
          Fill in all email fields if you want to enable email access. You can
          also skip this step and keep email integration disabled.
        </p>
      </div>
      <label className="wizard-field">
        <span>EMAIL_IMAP_HOST</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.emailImapHost}
          onChange={(event) =>
            updateEmailSetting(formData, onChange, 'emailImapHost', event.target.value)
          }
          placeholder="imap.gmail.com"
          required
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_IMAP_PORT</span>
        <input
          className="wizard-input"
          type="number"
          min="1"
          value={formData.emailImapPort}
          onChange={(event) =>
            updateEmailSetting(formData, onChange, 'emailImapPort', event.target.value)
          }
          placeholder="993"
          required
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_IMAP_SECURE</span>
        <select
          className="wizard-input"
          value={formData.emailImapSecure}
          onChange={(event) =>
            updateEmailSetting(formData, onChange, 'emailImapSecure', event.target.value)
          }
          required
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
      <label className="wizard-field">
        <span>EMAIL_IMAP_USER</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.emailImapUser}
          onChange={(event) =>
            updateEmailSetting(formData, onChange, 'emailImapUser', event.target.value)
          }
          placeholder="user@example.com"
          required
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_IMAP_PASSWORD</span>
        <input
          className="wizard-input"
          type="password"
          value={formData.emailImapPassword}
          onChange={(event) =>
            updateEmailSetting(
              formData,
              onChange,
              'emailImapPassword',
              event.target.value,
            )
          }
          placeholder="App password"
          required
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_HOST</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.emailSmtpHost}
          onChange={(event) =>
            updateEmailSetting(formData, onChange, 'emailSmtpHost', event.target.value)
          }
          placeholder="smtp.gmail.com"
          required
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_PORT</span>
        <input
          className="wizard-input"
          type="number"
          min="1"
          value={formData.emailSmtpPort}
          onChange={(event) =>
            updateEmailSetting(formData, onChange, 'emailSmtpPort', event.target.value)
          }
          placeholder="465"
          required
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_SECURE</span>
        <select
          className="wizard-input"
          value={formData.emailSmtpSecure}
          onChange={(event) =>
            updateEmailSetting(formData, onChange, 'emailSmtpSecure', event.target.value)
          }
          required
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_USER</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.emailSmtpUser}
          onChange={(event) =>
            updateEmailSetting(formData, onChange, 'emailSmtpUser', event.target.value)
          }
          placeholder="user@example.com"
          required
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_PASSWORD</span>
        <input
          className="wizard-input"
          type="password"
          value={formData.emailSmtpPassword}
          onChange={(event) =>
            updateEmailSetting(
              formData,
              onChange,
              'emailSmtpPassword',
              event.target.value,
            )
          }
          placeholder="App password"
          required
        />
      </label>
      <div className="actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onSkipEmail}
          disabled={isWizardSaving}
        >
          ПРОПУСТИТЬ
        </button>
      </div>
    </div>
  );
}

export const wizardStep = {
  order: 3,
  title: 'Email Settings',
  validate(formData) {
    const requiredFields = [
      ['emailImapHost', 'EMAIL_IMAP_HOST'],
      ['emailImapPort', 'EMAIL_IMAP_PORT'],
      ['emailImapSecure', 'EMAIL_IMAP_SECURE'],
      ['emailImapUser', 'EMAIL_IMAP_USER'],
      ['emailImapPassword', 'EMAIL_IMAP_PASSWORD'],
      ['emailSmtpHost', 'EMAIL_SMTP_HOST'],
      ['emailSmtpPort', 'EMAIL_SMTP_PORT'],
      ['emailSmtpSecure', 'EMAIL_SMTP_SECURE'],
      ['emailSmtpUser', 'EMAIL_SMTP_USER'],
      ['emailSmtpPassword', 'EMAIL_SMTP_PASSWORD'],
    ];

    for (const [field, label] of requiredFields) {
      if (!String(formData[field] || '').trim()) {
        return `${label} is required.`;
      }
    }

    if (!isPositiveInteger(formData.emailImapPort)) {
      return 'EMAIL_IMAP_PORT must be a positive integer.';
    }

    if (!isPositiveInteger(formData.emailSmtpPort)) {
      return 'EMAIL_SMTP_PORT must be a positive integer.';
    }

    return '';
  },
  async persist(formData) {
    await window.appControls.saveEmailSettings({
      EMAIL_IMAP_HOST: formData.emailImapHost || EMAIL_SETTINGS_DEFAULTS.emailImapHost,
      EMAIL_IMAP_PORT: formData.emailImapPort || EMAIL_SETTINGS_DEFAULTS.emailImapPort,
      EMAIL_IMAP_SECURE:
        formData.emailImapSecure || EMAIL_SETTINGS_DEFAULTS.emailImapSecure,
      EMAIL_IMAP_USER: formData.emailImapUser,
      EMAIL_IMAP_PASSWORD: formData.emailImapPassword,
      EMAIL_SMTP_HOST: formData.emailSmtpHost || EMAIL_SETTINGS_DEFAULTS.emailSmtpHost,
      EMAIL_SMTP_PORT: formData.emailSmtpPort || EMAIL_SETTINGS_DEFAULTS.emailSmtpPort,
      EMAIL_SMTP_SECURE:
        formData.emailSmtpSecure || EMAIL_SETTINGS_DEFAULTS.emailSmtpSecure,
      EMAIL_SMTP_USER: formData.emailSmtpUser,
      EMAIL_SMTP_PASSWORD: formData.emailSmtpPassword,
    });
  },
  Component: EmailSettingsStep,
};
