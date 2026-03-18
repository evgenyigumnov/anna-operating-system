function isPositiveInteger(value) {
  if (!String(value || '').trim()) {
    return true;
  }

  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0;
}

function EmailSettingsStep({ formData, onChange }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure email settings in `.env`</h2>
        <p>
          Set IMAP and SMTP settings used by `electron/email.js`. Leave fields
          empty to keep email tools and hooks disabled.
        </p>
      </div>
      <label className="wizard-field">
        <span>EMAIL_IMAP_HOST</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.emailImapHost}
          onChange={(event) => onChange('emailImapHost', event.target.value)}
          placeholder="imap.gmail.com"
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_IMAP_PORT</span>
        <input
          className="wizard-input"
          type="number"
          min="1"
          value={formData.emailImapPort}
          onChange={(event) => onChange('emailImapPort', event.target.value)}
          placeholder="993"
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_IMAP_SECURE</span>
        <select
          className="wizard-input"
          value={formData.emailImapSecure}
          onChange={(event) => onChange('emailImapSecure', event.target.value)}
        >
          <option value="">Use default</option>
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
          onChange={(event) => onChange('emailImapUser', event.target.value)}
          placeholder="user@example.com"
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_IMAP_PASSWORD</span>
        <input
          className="wizard-input"
          type="password"
          value={formData.emailImapPassword}
          onChange={(event) => onChange('emailImapPassword', event.target.value)}
          placeholder="App password"
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_HOST</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.emailSmtpHost}
          onChange={(event) => onChange('emailSmtpHost', event.target.value)}
          placeholder="smtp.gmail.com"
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_PORT</span>
        <input
          className="wizard-input"
          type="number"
          min="1"
          value={formData.emailSmtpPort}
          onChange={(event) => onChange('emailSmtpPort', event.target.value)}
          placeholder="465"
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_SECURE</span>
        <select
          className="wizard-input"
          value={formData.emailSmtpSecure}
          onChange={(event) => onChange('emailSmtpSecure', event.target.value)}
        >
          <option value="">Use default</option>
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
          onChange={(event) => onChange('emailSmtpUser', event.target.value)}
          placeholder="Optional, falls back to EMAIL_IMAP_USER"
        />
      </label>
      <label className="wizard-field">
        <span>EMAIL_SMTP_PASSWORD</span>
        <input
          className="wizard-input"
          type="password"
          value={formData.emailSmtpPassword}
          onChange={(event) => onChange('emailSmtpPassword', event.target.value)}
          placeholder="Optional, falls back to EMAIL_IMAP_PASSWORD"
        />
      </label>
    </div>
  );
}

export const wizardStep = {
  order: 3,
  title: 'Email Settings',
  validate(formData) {
    const hasEmailInput = [
      formData.emailImapHost,
      formData.emailImapPort,
      formData.emailImapSecure,
      formData.emailImapUser,
      formData.emailImapPassword,
      formData.emailSmtpHost,
      formData.emailSmtpPort,
      formData.emailSmtpSecure,
      formData.emailSmtpUser,
      formData.emailSmtpPassword,
    ].some((value) => String(value || '').trim());

    if (hasEmailInput && !String(formData.emailImapUser || '').trim()) {
      return 'EMAIL_IMAP_USER is required when email is enabled.';
    }

    if (hasEmailInput && !String(formData.emailImapPassword || '').trim()) {
      return 'EMAIL_IMAP_PASSWORD is required when email is enabled.';
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
      EMAIL_IMAP_HOST: formData.emailImapHost,
      EMAIL_IMAP_PORT: formData.emailImapPort,
      EMAIL_IMAP_SECURE: formData.emailImapSecure,
      EMAIL_IMAP_USER: formData.emailImapUser,
      EMAIL_IMAP_PASSWORD: formData.emailImapPassword,
      EMAIL_SMTP_HOST: formData.emailSmtpHost,
      EMAIL_SMTP_PORT: formData.emailSmtpPort,
      EMAIL_SMTP_SECURE: formData.emailSmtpSecure,
      EMAIL_SMTP_USER: formData.emailSmtpUser,
      EMAIL_SMTP_PASSWORD: formData.emailSmtpPassword,
    });
  },
  Component: EmailSettingsStep,
};
