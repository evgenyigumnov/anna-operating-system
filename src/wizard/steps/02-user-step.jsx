function UserStep({ formData, onChange }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure `USER.md`</h2>
        <p>
          Add user profile details that can help the assistant personalize replies.
          This step is optional.
        </p>
      </div>
      <label className="wizard-field">
        <span>USER.md content</span>
        <textarea
          className="wizard-textarea"
          value={formData.userMarkdown}
          onChange={(event) => onChange('userMarkdown', event.target.value)}
          rows="14"
          placeholder="# Name and surname&#10;John Doe"
        />
      </label>
    </div>
  );
}

export const wizardStep = {
  order: 2,
  title: 'User Profile',
  async persist(formData) {
    await window.appControls.saveUserMarkdown(formData.userMarkdown);
  },
  Component: UserStep,
};
