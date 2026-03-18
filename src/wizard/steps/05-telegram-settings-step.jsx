function TelegramSettingsStep({ formData, onChange }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure Telegram in `.env`</h2>
        <p>
          Set `TELEGRAM_TOKEN` for `electron/telegram.js`. Leave it empty to keep
          Telegram integration disabled.
        </p>
      </div>
      <label className="wizard-field">
        <span>TELEGRAM_TOKEN</span>
        <input
          className="wizard-input"
          type="password"
          value={formData.telegramToken}
          onChange={(event) => onChange('telegramToken', event.target.value)}
          placeholder="123456789:AA..."
        />
      </label>
    </div>
  );
}

export const wizardStep = {
  order: 5,
  title: 'Telegram',
  async persist(formData) {
    await window.appControls.saveTelegramSettings({
      TELEGRAM_TOKEN: formData.telegramToken,
    });
  },
  Component: TelegramSettingsStep,
};
