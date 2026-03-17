function IdentityStep({ formData, onChange }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure `IDENTITY.md`</h2>
        <p>
          Fill in the assistant profile that will be used to build the system
          prompt.
        </p>
      </div>
      <label className="wizard-field">
        <span>IDENTITY.md content</span>
        <textarea
          className="wizard-textarea"
          value={formData.identityMarkdown}
          onChange={(event) => onChange('identityMarkdown', event.target.value)}
          rows="14"
          placeholder="# Name&#10;Anna"
        />
      </label>
    </div>
  );
}

export const wizardStep = {
  title: 'Identity',
  validate(formData) {
    if (!formData.identityMarkdown.trim()) {
      return 'IDENTITY.md cannot be empty.';
    }

    return '';
  },
  async persist(formData) {
    await window.appControls.saveIdentityMarkdown(formData.identityMarkdown);
  },
  Component: IdentityStep,
};
