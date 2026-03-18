function hasEmailConfig(formData) {
  return (
    String(formData?.emailImapUser || '').trim() &&
    String(formData?.emailImapPassword || '').trim()
  );
}

function EmailMarkdownStep({ formData, onChange }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure `EMAIL.md`</h2>
        <p>
          Add email handling rules for the assistant. This step is shown only when
          email access is configured.
        </p>
      </div>
      <label className="wizard-field">
        <span>EMAIL.md content</span>
        <textarea
          className="wizard-textarea"
          value={formData.emailMarkdown}
          onChange={(event) => onChange('emailMarkdown', event.target.value)}
          rows="14"
          placeholder="# Rules&#10;- Important emails only"
        />
      </label>
    </div>
  );
}

export const wizardStep = {
  order: 4,
  title: 'Email Rules',
  isVisible(formData) {
    return hasEmailConfig(formData);
  },
  async persist(formData) {
    await window.appControls.saveEmailMarkdown(formData.emailMarkdown);
  },
  Component: EmailMarkdownStep,
};
